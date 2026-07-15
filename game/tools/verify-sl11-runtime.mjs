import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const agentServerRoot = path.resolve(gameRoot, '../agent-server')
const socialServerRoot = path.resolve(gameRoot, '../social-server')
const artifactDir = path.join(gameRoot, 'tmp/sl11-runtime')
const timeoutMs = 45_000

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function waitForOrigin(origin) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).status === 200) return
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`preview did not become ready: ${origin}`)
}

async function waitForPort(port) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => resolve(false))
    })
    if (connected) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`agent server did not become ready on port ${port}`)
}

function captureBrowserErrors(page, errors) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    errors.push(`requestfailed: ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`)
  })
}

function assertNonBlankScreenshot(file) {
  const image = PNG.sync.read(fs.readFileSync(file))
  assert.equal(image.width, 960)
  assert.equal(image.height, 540)
  const colors = new Set()
  for (let index = 0; index < image.data.length; index += 64) {
    colors.add(`${image.data[index]},${image.data[index + 1]},${image.data[index + 2]}`)
  }
  assert(colors.size >= 64, `${file} is visually blank`)
}

async function waitForShell(page, scene) {
  await page.waitForFunction(
    (expected) => typeof window.__shellScene === 'function' && window.__shellScene() === expected,
    scene,
    { timeout: timeoutMs },
  )
}

async function enterWorldMap(page) {
  await waitForShell(page, 'mainmenu')
  await page.evaluate(() => window.__shellEnter())
  await page.waitForFunction(
    () => document.querySelector('input[type="password"]') !== null
      || (typeof window.__shellScene === 'function' && ['charselect', 'worldmap'].includes(window.__shellScene())),
    undefined,
    { timeout: timeoutMs },
  )
  if (await page.locator('input[type="password"]').count() > 0) {
    await page.locator('input[type="text"]').fill(`runtimegate-${Date.now()}`)
    await page.locator('input[type="password"]').fill('runtime-gate-password')
    await page.locator('input[type="password"]').press('Enter')
    await page.waitForFunction(
      () => typeof window.__shellScene === 'function' && ['charselect', 'worldmap'].includes(window.__shellScene()),
      undefined,
      { timeout: timeoutMs },
    )
  }
  const scene = await page.evaluate(() => window.__shellScene())
  if (scene === 'charselect') {
    await page.evaluate(() => window.__shellStartGame())
  }
  await waitForShell(page, 'worldmap')
}

function gameUrl(origin, query, npcServer, socialServer) {
  return `${origin}/?${query}&npcServer=${encodeURIComponent(npcServer)}&socialServer=${encodeURIComponent(socialServer)}`
}

async function runProductionRuntime(page, origin, npcServer, socialServer, errors) {
  await page.goto(gameUrl(origin, 'battleRuntime=1&runtimeDebug=gate', npcServer, socialServer))
  await enterWorldMap(page)
  await page.evaluate(() => {
    const key = 'zmxy3-remake.slot.v1.0'
    const envelope = JSON.parse(localStorage.getItem(key))
    envelope.save.equipment.weapon = {
      id: 'runtime-gate-staff', name: '验收青云棍', kind: 'equip', rarity: 2,
      sourceType: 'zbwq', sourceUser: '悟空', sourceShowId: 1,
      effects: [{ type: 'stat', stat: 'atk', value: 7 }, { type: 'stat', stat: 'mp', value: 10 }],
    }
    envelope.save.equipment.armor = {
      id: 'runtime-gate-armor', name: '验收青云甲', kind: 'equip', rarity: 2,
      sourceType: 'zbfj', sourceUser: '悟空',
      effects: [{ type: 'stat', stat: 'def', value: 5 }, { type: 'stat', stat: 'hp', value: 20 }],
    }
    envelope.save.skills.schools[0] = { level: 1, learned: [{ skillName: 'slz', level: 1 }] }
    envelope.save.skills.bindings.Y = 'slz'
    localStorage.setItem(key, JSON.stringify(envelope))
  })
  const mapFile = path.join(artifactDir, 'world-map.png')
  await page.screenshot({ path: mapFile })
  assertNonBlankScreenshot(mapFile)

  assert.equal(await page.evaluate(() => window.__shellMapEnterLevel(0)), true)
  try {
    await page.waitForFunction(() => window.__battleRuntime !== undefined, undefined, { timeout: timeoutMs })
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, 'runtime-ready-failure.png') })
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      shellScene: typeof window.__shellScene === 'function' ? window.__shellScene() : null,
      loading: typeof window.__shellLoadingState === 'function' ? window.__shellLoadingState() : null,
      hasLegacy: window.__scene !== undefined,
      canvasCount: document.querySelectorAll('canvas').length,
    }))
    fs.writeFileSync(path.join(artifactDir, 'runtime-ready-failure.json'), `${JSON.stringify({ diagnostics, errors }, null, 2)}\n`)
    throw error
  }
  await page.evaluate(() => window.__battleRuntime.setManualMode(true))

  const initial = await page.evaluate(() => window.__battleRuntime.getSnapshot())
  assert.equal(initial.level.id, 'sl11')
  assert.equal(initial.level.cleared, false)
  assert.deepEqual(initial.heroEquipment, {
    weaponItemId: 'runtime-gate-staff',
    armorItemId: 'runtime-gate-armor',
    weaponShowId: 1,
  })
  assert.equal(initial.heroSkill.maxMp, 60)

  const proof = await page.evaluate(() => {
    const runtime = window.__battleRuntime
    let sequence = 0
    const snapshot = () => runtime.getSnapshot()
    const enqueue = (type, skillId) => {
      runtime.enqueue({
        type,
        ...(skillId ? { skillId } : {}),
        actorId: 'hero-1',
        sequence: ++sequence,
        atTick: snapshot().tick + 1,
      })
    }

    runtime.step(1)
    const bossSpawned = snapshot().actors.some((actor) => actor.contentId === 'monster.chapter1.monster3')
    const startX = snapshot().actors[0].x
    enqueue('press-right')
    runtime.step(3)
    enqueue('release-right')
    runtime.step(1)
    const movedX = snapshot().actors[0].x
    enqueue('press-jump')
    runtime.step(2)
    const jumpedY = snapshot().actors[0].y
    runtime.step(40)

    enqueue('press-skill', 'slz')
    runtime.step(30)
    enqueue('press-attack')
    runtime.step(1)
    runtime.step(60)
    const beforeDoor = snapshot()
    const hashBeforeClear = runtime.getHash()
    enqueue('press-interact')
    runtime.step(1)
    return {
      bossSpawned,
      startX,
      movedX,
      jumpedY,
      beforeDoor,
      final: snapshot(),
      hashBeforeClear,
      finalHash: runtime.getHash(),
      events: runtime.getEvents(),
      heroSkill: snapshot().heroSkill,
      storedFrontier: localStorage.getItem('zmxy3-remake.slot.v1.0.level'),
    }
  })

  assert.equal(proof.bossSpawned, true)
  assert(proof.movedX > proof.startX, 'press-right did not move the hero')
  assert(proof.jumpedY < initial.actors[0].y, 'press-jump did not move the hero upward')
  assert.equal(proof.beforeDoor.level.doorVisible, true)
  assert.equal(proof.final.level.cleared, true)
  assert.match(proof.finalHash, /^[0-9a-f]{8}$/)
  assert(proof.events.some((event) => event.type === 'attack-started'))
  assert(proof.events.some((event) => event.type === 'skill-cast' && event.skillId === 'slz'))
  assert.equal(proof.heroSkill.mp, 24)
  assert(proof.events.some((event) => event.type === 'actor-defeated'))
  assert(proof.events.some((event) => event.type === 'door-revealed'))
  assert(proof.events.some((event) => event.type === 'stage-cleared'))
  assert.equal(proof.storedFrontier, '1', 'stage clear did not persist the campaign frontier')

  const battleFile = path.join(artifactDir, 'stage-cleared.png')
  await page.screenshot({ path: battleFile })
  assertNonBlankScreenshot(battleFile)
  await page.waitForFunction(
    () => typeof window.__shellMapState === 'function' && window.__shellMapState().currentIndex === 1,
    undefined,
    { timeout: timeoutMs },
  )
  const settled = await page.evaluate(() => window.__shellMapState())
  assert.equal(settled.currentIndex, 1)

  return {
    storedFrontier: await page.evaluate(() => localStorage.getItem('zmxy3-remake.slot.v1.0.level')),
    hashBeforeClear: proof.hashBeforeClear,
    finalHash: proof.finalHash,
    eventCount: proof.events.length,
  }
}

async function runLegacyFallback(page, origin, npcServer, socialServer) {
  await page.goto(gameUrl(origin, 'runtimeDebug=gate', npcServer, socialServer))
  await enterWorldMap(page)
  assert.equal(await page.evaluate(() => window.__shellMapEnterLevel(0)), true)
  await page.waitForFunction(() => window.__scene !== undefined, undefined, { timeout: timeoutMs })
  assert.equal(await page.evaluate(() => window.__battleRuntime), undefined)
  const file = path.join(artifactDir, 'legacy-fallback.png')
  await page.screenshot({ path: file })
  assertNonBlankScreenshot(file)
}

let preview
let agentServer
let socialServer
let browser
try {
  fs.rmSync(artifactDir, { recursive: true, force: true })
  fs.mkdirSync(artifactDir, { recursive: true })
  const port = await reservePort()
  const agentPort = await reservePort()
  const socialPort = await reservePort()
  agentServer = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
    cwd: agentServerRoot,
    env: { ...process.env, AGENT_SERVER_PORT: String(agentPort) },
    stdio: 'ignore',
  })
  await waitForPort(agentPort)
  const npcServer = `ws://127.0.0.1:${agentPort}`
  socialServer = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
    cwd: socialServerRoot,
    env: {
      ...process.env,
      JWT_SECRET: 'sl11-runtime-browser-gate',
      SOCIAL_SERVER_PORT: String(socialPort),
      SOCIAL_DB_PATH: path.join(artifactDir, 'social.sqlite'),
    },
    stdio: 'ignore',
  })
  await waitForPort(socialPort)
  const socialOrigin = `http://127.0.0.1:${socialPort}`
  preview = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: gameRoot, stdio: 'ignore' })
  const origin = `http://127.0.0.1:${port}`
  await waitForOrigin(origin)
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })
  const errors = []
  const runtimePage = await context.newPage()
  captureBrowserErrors(runtimePage, errors)
  const result = await runProductionRuntime(runtimePage, origin, npcServer, socialOrigin, errors)
  await runtimePage.close()

  const fallbackPage = await context.newPage()
  captureBrowserErrors(fallbackPage, errors)
  await runLegacyFallback(fallbackPage, origin, npcServer, socialOrigin)
  await fallbackPage.close()
  await context.close()
  assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`)

  fs.writeFileSync(path.join(artifactDir, 'result.json'), `${JSON.stringify({ origin, ...result }, null, 2)}\n`)
  console.log(`sl11 runtime browser gate passed: ${artifactDir}`)
} finally {
  await browser?.close()
  preview?.kill('SIGTERM')
  agentServer?.kill('SIGTERM')
  socialServer?.kill('SIGTERM')
}
