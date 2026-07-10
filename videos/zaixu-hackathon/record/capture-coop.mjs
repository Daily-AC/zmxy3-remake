import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SITE = process.env.ZAIXU_URL || 'https://zaixu.qmledmq.cn:8443/'
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

async function ensureWorldMap(page) {
  for (let attempts = 0; attempts < 20; attempts += 1) {
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

const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  headless: false,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
  permissions: ['clipboard-read', 'clipboard-write'],
  args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1920,1180'],
})
const page = context.pages()[0] || (await context.newPage())

try {
  console.log('opening game')
  await page.goto(SITE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 })
  await sleep(1400)
  console.log('navigating to world map')
  await ensureWorldMap(page)
  console.log('opening co-op lobby')
  await page.evaluate(() => window.__shellGoToLobby?.())
  await waitFor(page, () => window.__shellScene?.() === 'cooplobby')
  console.log('waiting for room selector')
  await waitFor(page, () => window.__shellLobbyState?.().mode === 'roomSelect')
  await sleep(1000)

  console.log('recording room creation')
  await startCanvasCapture(page)
  await sleep(900)
  await page.evaluate(() => window.__shellLobbyCreateRoom?.('L1'))
  await waitFor(page, () => {
    const state = window.__shellLobbyState?.()
    return state?.mode === 'inRoom' && !!state.room
  })
  console.log('room created')
  await sleep(1700)
  await page.evaluate(() => window.__shellLobbyToggleReady?.())
  await sleep(1000)
  await page.evaluate(() => {
    // Avoid opening macOS's native share sheet during automated capture. The
    // product then uses its normal clipboard fallback and shows the in-game
    // "邀请链接已复制" confirmation.
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    void window.__shellLobbyShare?.()
  })
  await sleep(2200)
  await stopCanvasCapture(page, 'coop-room')
} finally {
  await context.close()
}
