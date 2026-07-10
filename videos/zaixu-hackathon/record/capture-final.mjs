import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SITE = process.env.ZAIXU_URL || 'https://zaixu.qmledmq.cn:8443/'
const USERNAME = process.env.ZAIXU_USERNAME || '行者'
const PASSWORD = process.env.ZAIXU_PASSWORD
const ROOT = path.resolve('..')
const RAW_DIR = path.join(ROOT, 'media', 'gameplay', 'raw')
const OUT_DIR = path.join(ROOT, 'media', 'gameplay')
const PROFILE = path.resolve('profile-final')
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

async function scene(page) {
  return page.evaluate(() => window.__shellScene?.() ?? null).catch(() => null)
}

async function waitScene(page, expected, timeoutMs = 30000) {
  return waitFor(page, () => window.__shellScene?.() === expected, timeoutMs)
}

async function ensureWorldMap(page) {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    const loginInputs = page.locator('input.wendie-input')
    const inputCount = await loginInputs.count()
    const current = await scene(page)
    console.log(`navigation attempt ${attempts}: scene=${current} inputs=${inputCount}`)
    if (inputCount >= 2) {
      if (!PASSWORD) throw new Error('ZAIXU_PASSWORD is required when the saved session is not active')
      // Fresh profiles open in register mode. Switch to login using the
      // painted link at logical (540, 427), scaled 2x in this viewport.
      await page.mouse.click(1080, 854)
      await sleep(350)
      await loginInputs.nth(0).fill(USERNAME)
      await loginInputs.nth(1).fill(PASSWORD)
      await loginInputs.nth(1).press('Enter')
      await sleep(1800)
      continue
    }
    if (current === 'worldmap') return
    if (current === 'mainmenu') {
      await page.evaluate(() => window.__shellEnter?.())
      await sleep(500)
      continue
    }
    if (current === 'charselect') {
      await page.evaluate(() => window.__shellStartGame?.())
      await sleep(1000)
      continue
    }
    if (current === 'cooplobby') {
      await page.evaluate(() => window.__shellLobbyBackToMap?.())
      await sleep(800)
      continue
    }
    if (typeof current === 'string') {
      await page.evaluate(() => window.__scene?.scene?.start('worldmap'))
      await sleep(1000)
      continue
    }
    await sleep(800)
  }
  await waitScene(page, 'worldmap')
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
  await sleep(250)
  await action()
  await sleep(250)
  await stopCanvasCapture(page, name)
}

async function enterLevel(page, index) {
  await ensureWorldMap(page)
  await page.evaluate((levelIndex) => window.__shellMapEnterLevel?.(levelIndex), index)
  await waitFor(page, () => typeof window.__worldState === 'function' && !!window.__scene, 90000)
  await sleep(1800)
}

const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  headless: false,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1920,1180'],
})
const page = context.pages()[0] || (await context.newPage())

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 })
  await sleep(1800)
  await ensureWorldMap(page)

  await record(page, 'world-map', async () => {
    await page.mouse.move(330, 920, { steps: 20 })
    await sleep(1800)
    await page.mouse.move(1100, 480, { steps: 30 })
    await sleep(2200)
  })

  await page.evaluate(() => {
    window.__giveMaterials?.('wptm', 12)
    window.__giveMaterials?.('ptdxzg', 1)
    window.__giveMaterials?.('whg', 1)
    window.__giveSoul?.(999)
    window.__shellMapAction?.('furnace')
  })
  await sleep(700)
  await record(page, 'furnace', async () => {
    await page.mouse.move(1240, 520, { steps: 20 })
    await sleep(5200)
  })

  // The furnace is a full modal surface. Reloading returns to the persisted
  // map cleanly before changing scenes and avoids recording it over the lobby.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 })
  await sleep(1200)
  await ensureWorldMap(page)

  await enterLevel(page, 0)
  await waitFor(page, () => window.__worldState?.().aliveMonsters > 0, 30000)
  await page.evaluate(() => {
    window.__gainExp?.(18000)
    const monster = window.__worldState?.().monster
    if (monster) window.__teleportTo?.(monster.x - 135)
  })
  await record(page, 'nine-heavens-combat', async () => {
    await page.keyboard.down('d')
    await sleep(650)
    await page.keyboard.up('d')
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('j')
      await sleep(440)
    }
    await page.evaluate(() => window.__fxDemo?.(18))
    await sleep(900)
    await page.keyboard.press('k')
    await sleep(360)
    await page.keyboard.press('j')
    await sleep(1600)
  })

  await page.evaluate(() => window.localStorage.setItem('zmxy3-remake.slot.v1.0.level', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 })
  await sleep(1200)
  await ensureWorldMap(page)
  await page.evaluate(() => {
    window.__giveMaterials?.('ptdxzg', 1)
    window.__giveMaterials?.('whg', 1)
  })
  await enterLevel(page, 1)
  // Tiangongdao's first combat stop is at x=1147.4. Cross the stop so the
  // first monster wave is actually spawned before recording the showcase.
  await page.evaluate(() => window.__teleportTo?.(1180))
  await waitFor(page, () => window.__worldState?.().aliveMonsters > 0, 30000)
  await page.evaluate(() => window.__equip?.('ptdxzg'))
  await sleep(400)
  await page.evaluate(() => window.__toggleBackpack?.())
  await record(page, 'backpack-equipment', async () => {
    await sleep(5200)
  })
  await page.evaluate(() => window.__toggleBackpack?.())
  await page.evaluate(() => {
    const monster = window.__worldState?.().monster
    if (monster) window.__teleportTo?.(monster.x - 150)
  })
  await record(page, 'tiangongdao-combat', async () => {
    await page.keyboard.down('d')
    await sleep(700)
    await page.keyboard.up('d')
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('j')
      await sleep(450)
    }
    await page.evaluate(() => window.__fxDemo?.(24))
    await sleep(950)
    await page.keyboard.press('k')
    await sleep(350)
    await page.keyboard.press('j')
    await sleep(1500)
  })
} finally {
  await context.close()
}
