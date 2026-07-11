import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SITE = process.env.ZAIXU_URL || 'https://zaixu.qmledmq.cn:8443/'
const SOCIAL = process.env.ZAIXU_SOCIAL_URL || 'https://zm-dev.qmledmq.cn:8443/social'
const SESSION_KEY = 'zmxy.social.session'
const ROOT = path.resolve('..')
const RAW_DIR = path.join(ROOT, 'media', 'gameplay', 'raw')
const OUT_DIR = path.join(ROOT, 'media', 'gameplay')
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

fs.mkdirSync(RAW_DIR, { recursive: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(page, fn, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await page.evaluate(fn).catch(() => null)
    if (value) return value
    await sleep(250)
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function gotoWithRetry(page, url, attempts = 5) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      return
    } catch (error) {
      lastError = error
      console.warn(`navigation attempt ${attempt}/${attempts} failed: ${error.message}`)
      await sleep(800 * attempt)
    }
  }
  throw lastError
}

async function ensureCanvas(page, url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.waitForSelector('canvas', { state: 'attached', timeout: 45000 })
      return
    } catch (error) {
      console.warn(`${label} canvas attempt ${attempt}/3 failed: ${error.message}`)
      await gotoWithRetry(page, url)
    }
  }
  throw new Error(`${label} canvas unavailable`)
}

async function clickLogical(page, x, y) {
  const rect = await page.locator('canvas').boundingBox()
  if (!rect) throw new Error('canvas bounds unavailable')
  await page.mouse.click(rect.x + (x / 960) * rect.width, rect.y + (y / 540) * rect.height)
}

async function registerAccount(label) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = `${String(Date.now()).slice(-6)}${attempt}`
    const username = `悟空${label}${suffix}`
    const password = `capture-${Date.now()}-${attempt}`
    const response = await fetch(`${SOCIAL}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = await response.json().catch(() => null)
    if (response.status === 409 && body?.error === 'username_taken') continue
    if (!response.ok || !body?.token || !body?.user) {
      throw new Error(`account registration failed: ${response.status} ${body?.error ?? 'invalid_response'}`)
    }
    return { token: body.token, user: body.user }
  }
  throw new Error('could not allocate unique capture account')
}

async function getRoom(session, roomId) {
  const response = await fetch(`${SOCIAL}/rooms/${encodeURIComponent(roomId)}`, {
    headers: { authorization: `Bearer ${session.token}` },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.room) throw new Error(`room lookup failed: ${response.status}`)
  return body.room
}

async function startRoomViaWs(session, roomId) {
  const wsUrl = `${SOCIAL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/ws`
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('fallback start websocket timed out'))
    }, 10000)
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', token: session.token, roomId }))
    })
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.type === 'room_state') ws.send(JSON.stringify({ type: 'start' }))
      if (message.type === 'game_start' || message.type === 'error') {
        clearTimeout(timeout)
        ws.close()
        if (message.type === 'error') reject(new Error(`fallback start rejected: ${message.message}`))
        else resolve()
      }
    })
    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('fallback start websocket failed'))
    })
  })
}

async function openHeroStateStreamer(page, session, roomId, initialState) {
  const wsUrl = `${SOCIAL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/ws`
  await page.evaluate(({ wsUrl, session, roomId, initialState }) => new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const hero = {
      userId: session.user.id,
      heroId: '1',
      x: initialState.x,
      y: initialState.y,
      facing: 1,
      action: 'ready',
      animState: 'ready',
      hp: 620,
      maxHp: 620,
      alive: true,
      level: 18,
    }
    let seq = 10000
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('hero state websocket timed out'))
    }, 15000)
    const sendState = () => {
      if (ws.readyState !== WebSocket.OPEN) return
      const sentAt = Date.now()
      ws.send(JSON.stringify({
        type: 'state',
        seq: ++seq,
        sentAt,
        payload: { coopType: 'hero_state', hero: { ...hero } },
      }))
    }
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', token: session.token, roomId }))
    })
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.type !== 'room_state') return
      clearTimeout(timeout)
      sendState()
      const timer = setInterval(sendState, 100)
      window.__guestHeroStreamer = {
        set(patch) {
          Object.assign(hero, patch)
          if (patch.action && !patch.animState) hero.animState = patch.action
          sendState()
        },
        close() {
          clearInterval(timer)
          ws.close()
        },
      }
      resolve(true)
    })
    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('hero state websocket failed'))
    })
  }), { wsUrl, session, roomId, initialState })
  return {
    set(patch) {
      return page.evaluate((value) => window.__guestHeroStreamer?.set(value), patch)
    },
    close() {
      return page.evaluate(() => window.__guestHeroStreamer?.close())
    },
  }
}

async function seedSession(context, session) {
  await context.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value)
  }, { key: SESSION_KEY, value: JSON.stringify(session) })
}

async function ensureWorldMap(page) {
  for (let attempts = 0; attempts < 25; attempts += 1) {
    const current = await page.evaluate(() => window.__shellScene?.() ?? null).catch(() => null)
    if (current === 'worldmap') return
    if (current === 'mainmenu') await page.evaluate(() => window.__shellEnter?.())
    else if (current === 'charselect') await page.evaluate(() => window.__shellStartGame?.())
    else if (current === 'cooplobby') await page.evaluate(() => window.__shellLobbyBackToMap?.())
    else if (typeof current === 'string') await page.evaluate(() => window.__scene?.scene?.start('worldmap'))
    await sleep(700)
  }
  throw new Error('Could not reach world map')
}

async function startCanvasCapture(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas not found')
    const candidates = [
      'video/mp4;codecs=avc1.640033',
      'video/mp4;codecs=avc1.64002A',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
    ]
    const mimeType = candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || ''
    const stream = canvas.captureStream(60)
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 18_000_000 })
    const chunks = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve
    })
    recorder.start(500)
    window.__videoCapture = { recorder, chunks, stream, stopped, mimeType }
  })
}

async function stopCanvasCapture(page, name) {
  const capture = await page.evaluate(async () => {
    const active = window.__videoCapture
    if (!active) throw new Error('capture not active')
    active.recorder.stop()
    await active.stopped
    const blob = new Blob(active.chunks, { type: active.mimeType })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    active.stream.getTracks().forEach((track) => track.stop())
    window.__videoCapture = null
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000))
    }
    return { b64: btoa(binary), mimeType: blob.type }
  })
  const ext = capture.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
  const rawPath = path.join(RAW_DIR, `${name}.${ext}`)
  const outPath = path.join(OUT_DIR, `${name}.mp4`)
  fs.writeFileSync(rawPath, Buffer.from(capture.b64, 'base64'))
  execFileSync('ffmpeg', [
    '-y', '-i', rawPath,
    '-vf', 'scale=1920:1080:flags=lanczos,fps=60',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', '-an',
    outPath,
  ], { stdio: 'ignore' })
  console.log(`captured ${name} -> ${outPath}`)
}

async function record(page, name, action) {
  await startCanvasCapture(page)
  await sleep(300)
  await action()
  await sleep(300)
  await stopCanvasCapture(page, name)
}

const browserOptions = {
  executablePath: CHROME,
  headless: false,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
}

const hostBrowser = await chromium.launch(browserOptions)
const guestBrowser = await chromium.launch(browserOptions)
const hostContext = await hostBrowser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
const guestContext = await guestBrowser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
const hostSession = await registerAccount('甲')
const guestSession = await registerAccount('乙')
await seedSession(hostContext, hostSession)
await seedSession(guestContext, guestSession)
const host = await hostContext.newPage()
const guest = await guestContext.newPage()

try {
  console.log(`capture users: ${hostSession.user.username}, ${guestSession.user.username}`)
  await gotoWithRetry(host, SITE)
  await ensureCanvas(host, SITE, 'host')
  await gotoWithRetry(guest, SITE)
  await ensureCanvas(guest, SITE, 'guest')
  await sleep(1400)
  await Promise.all([ensureWorldMap(host), ensureWorldMap(guest)])

  await host.evaluate(() => window.__shellGoToLobby?.())
  await waitFor(host, () => window.__shellScene?.() === 'cooplobby')
  await waitFor(host, () => window.__shellLobbyState?.().mode === 'roomSelect')

  await startCanvasCapture(host)
  await sleep(700)
  await host.evaluate(() => window.__shellLobbyCreateRoom?.('L1'))
  const hostRoom = await waitFor(host, () => {
    const state = window.__shellLobbyState?.()
    return state?.mode === 'inRoom' && state.room ? state.room : null
  })
  await sleep(900)
  await host.evaluate(() => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    void window.__shellLobbyShare?.()
  })
  await sleep(900)

  const inviteUrl = new URL(SITE)
  inviteUrl.searchParams.set('room', hostRoom.id)
  await gotoWithRetry(guest, inviteUrl.toString())
  await guest.waitForSelector('canvas')
  await waitFor(guest, () => window.__shellScene?.() === 'cooplobby', 45000)
  await waitFor(guest, () => window.__shellLobbyState?.().mode === 'inRoom', 45000)
  await waitFor(host, () => window.__shellLobbyState?.().room?.members?.length === 2, 45000)
  await sleep(1600)
  await stopCanvasCapture(host, 'coop-room')

  await Promise.all([
    host.evaluate(() => window.__shellLobbyToggleReady?.()),
    guest.evaluate(() => window.__shellLobbyToggleReady?.()),
  ])
  await waitFor(host, () => window.__shellLobbyState?.().room?.members?.every((member) => member.ready))
  await waitFor(guest, () => window.__shellLobbyState?.().room?.members?.every((member) => member.ready))
  const readyRoom = await getRoom(hostSession, hostRoom.id)
  if (!readyRoom.members.every((member) => member.ready)) throw new Error('server room is not ready')
  await sleep(800)
  await guest.bringToFront()
  await sleep(300)
  await host.bringToFront()
  await clickLogical(host, 480, 428)
  await sleep(1200)
  const startedRoom = await getRoom(hostSession, hostRoom.id)
  if (startedRoom.status !== 'in_game') {
    console.warn('start button did not transition room; using protocol fallback')
    await startRoomViaWs(hostSession, hostRoom.id)
  }

  const guestStream = await openHeroStateStreamer(host, guestSession, hostRoom.id, { x: 600, y: 423 })
  await guestContext.close()

  await waitFor(host, () => typeof window.__worldState === 'function' && !!window.__scene, 150000)
  await waitFor(host, () => window.__worldState?.().aliveMonsters > 0, 30000)
  const battlePlacement = await host.evaluate(() => {
    const monster = window.__worldState?.().monster
    if (monster) window.__teleportTo?.(monster.x - 210)
    return { monsterX: monster?.x ?? 600, heroY: window.__heroState?.().y ?? 423 }
  })
  await guestStream.set({ x: battlePlacement.monsterX - 82, y: battlePlacement.heroY, action: 'ready' })
  await waitFor(host, () => window.__scene?.remoteHeroes?.size >= 1, 30000)
  await sleep(1200)

  await host.bringToFront()
  await record(host, 'coop-battle', async () => {
    await guestStream.set({ action: 'walk', x: battlePlacement.monsterX - 105 })
    await host.keyboard.press('j')
    await sleep(500)
    await guestStream.set({ action: 'hit1' })
    await sleep(700)
    await guestStream.set({ action: 'hit2' })
    await sleep(500)
    await host.keyboard.press('j')
    await sleep(700)
    await guestStream.set({ action: 'hit3' })
    await host.keyboard.press('k')
    await sleep(900)
    await host.keyboard.press('j')
    await guestStream.set({ action: 'hit4' })
    await sleep(1700)
  })
  await guestStream.close()
} finally {
  await hostContext.close()
  await guestContext.close()
  await hostBrowser.close()
  await guestBrowser.close()
}
