import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { PROTOCOL_VERSION } from '@zaixu/protocol'
import { SAVE_SCHEMA_VERSION } from '@zaixu/save-schema'
import { PRESENTATION_CONTRACT_VERSION } from '@zaixu/presentation-contract'
import {
  assertCombatCoreBugBundle,
  assertDistribution,
  commitFileSet,
  npmInvocation,
} from './combat-core-verification-lib.mjs'

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(gameRoot, '..')
const artifactDir = path.join(gameRoot, 'tmp/combat-core-slice')
const baselineDir = path.join(gameRoot, 'tests/baselines')
const gamePackage = JSON.parse(fs.readFileSync(path.join(gameRoot, 'package.json'), 'utf8'))
const expectedBugBundle = {
  gameVersion: gamePackage.version,
  contentVersion: 'combat-core-slice@1',
  saveSchemaVersion: SAVE_SCHEMA_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  presentationVersion: PRESENTATION_CONTRACT_VERSION,
  randomSeed: 0x5a17,
}
const modes = ['initial', 'hit3', 'impact', 'dead']
const candidateOnly = process.env.COMBAT_CORE_VISUAL_CANDIDATE_ONLY === '1'
const updateBaseline = process.env.UPDATE_COMBAT_CORE_BASELINE === '1'
const windowsReference = process.argv.includes('--windows-reference')
const perfOnly = process.argv.includes('--perf-only')
const jsonOutput = process.argv.includes('--json')
const COLD_LOAD_TIMEOUT_MS = 45_000
assert(!(candidateOnly && updateBaseline), 'candidate-only and update-baseline modes are mutually exclusive')

function writeJson(file, value) {
  fs.writeFileSync(path.join(artifactDir, file), `${JSON.stringify(value, null, 2)}\n`)
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

function assertNonBlankPng(file, expectedWidth = 960, expectedHeight = 540) {
  const png = readPng(file)
  assert.equal(png.width, expectedWidth, `${file} width`)
  assert.equal(png.height, expectedHeight, `${file} height`)
  let opaque = 0
  let changed = 0
  const colors = new Set()
  const base = [png.data[0], png.data[1], png.data[2]]
  for (let index = 0; index < png.data.length; index += 4) {
    const r = png.data[index]
    const g = png.data[index + 1]
    const b = png.data[index + 2]
    const a = png.data[index + 3]
    if (a >= 16) opaque += 1
    if (Math.abs(r - base[0]) + Math.abs(g - base[1]) + Math.abs(b - base[2]) > 24) changed += 1
    if (index % 64 === 0) colors.add(`${r},${g},${b},${a}`)
  }
  const pixels = png.width * png.height
  assert(opaque / pixels >= 0.8, `${file} is mostly transparent`)
  assert(changed / pixels >= 0.05, `${file} is visually blank`)
  assert(colors.size >= 64, `${file} has insufficient color diversity`)
  return png
}

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  const port = address.port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForOrigin(origin) {
  const deadline = Date.now() + 15_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin)
      if (response.status === 200) return
      lastError = new Error(`preview returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw lastError ?? new Error('preview did not become ready')
}

function capturePageErrors(page, label, errors) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`${label}: pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    errors.push(`${label}: requestfailed: ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label}: http ${response.status()}: ${response.url()}`)
  })
}

async function waitForHook(page, errors) {
  try {
    await page.waitForFunction(
      () => window.__combatCoreSlice !== undefined,
      undefined,
      { timeout: COLD_LOAD_TIMEOUT_MS },
    )
  } catch (error) {
    const diagnostics = await page.evaluate((capturedErrors) => {
      const overlay = document.querySelector('#asset-loading')
      return {
        url: location.href,
        readyState: document.readyState,
        overlayText: overlay?.textContent?.trim() ?? null,
        overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
        canvasCount: document.querySelectorAll('canvas').length,
        scripts: [...document.scripts].map((script) => script.src || '<inline>'),
        resources: performance.getEntriesByType('resource').map((entry) => ({
          name: entry.name,
          duration: entry.duration,
          transferSize: 'transferSize' in entry ? entry.transferSize : null,
        })),
        userAgent: navigator.userAgent,
        errors: capturedErrors.slice(-20),
      }
    }, errors).catch(() => null)
    throw new Error(`combat core hook did not become ready: ${JSON.stringify(diagnostics)}`, { cause: error })
  }
}

async function waitForLoadingOverlay(page) {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#asset-loading')
    return overlay && getComputedStyle(overlay).opacity === '0'
  }, undefined, { timeout: COLD_LOAD_TIMEOUT_MS })
}

async function hookValue(page, expression) {
  return page.evaluate(expression)
}

async function pressSampled(page, key) {
  const before = await hookValue(page, () => window.__combatCoreSlice.getCommands().length)
  await page.keyboard.down(key)
  await page.waitForFunction(
    (count) => window.__combatCoreSlice.getCommands().length === count + 1,
    before,
    { timeout: 2_000 },
  )
  await page.keyboard.up(key)
  const tick = await hookValue(page, () => window.__combatCoreSlice.getSnapshot().tick)
  if (key === 'KeyA' || key === 'KeyD') {
    const releaseType = key === 'KeyA' ? 'release-left' : 'release-right'
    await page.waitForFunction(
      ({ count, releaseType }) => {
        const commands = window.__combatCoreSlice.getCommands()
        return commands.length >= count + 2 && commands.at(-1)?.type === releaseType
      },
      { count: before, releaseType },
      { timeout: 2_000 },
    )
  }
  await page.waitForFunction(
    (startTick) => window.__combatCoreSlice.getSnapshot().tick >= startTick + 2,
    tick,
    { timeout: 2_000 },
  )
}

function eventSummary(event) {
  const summary = { type: event.type }
  for (const key of ['action', 'reason', 'amount', 'actorId', 'sourceId', 'targetId', 'airborne']) {
    if (event[key] !== undefined) summary[key] = event[key]
  }
  return summary
}

function cueSummary(cue) {
  const summary = { type: cue.type }
  for (const key of ['action', 'actorId', 'sourceId', 'targetId', 'amount', 'effect', 'sound', 'hitStopMs']) {
    if (cue.payload?.[key] !== undefined) summary[key] = cue.payload[key]
  }
  return summary
}

async function runFunctionalProof(browser, origin, errors) {
  const timeline = []
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    recordVideo: { dir: artifactDir, size: { width: 960, height: 540 } },
  })
  const page = await context.newPage()
  capturePageErrors(page, 'functional', errors)
  await page.goto(`${origin}/?combatCoreSlice=1`)
  await waitForHook(page, errors)
  const video = page.video()
  assert(video)
  timeline.push({ scenario: 'normal', milestone: 'start' })

  const view = await hookValue(page, () => window.__combatCoreSlice.getViewState())
  assert.deepEqual(view.heroPosition, { x: 487.5, y: 377.5 })
  assert.deepEqual(view.monsterPosition, { x: 904.5, y: 403 })
  assert(Math.abs(view.heroVisibleBottomY - view.monsterVisibleBottomY) <= 0.5)
  await waitForLoadingOverlay(page)
  await page.screenshot({ path: path.join(artifactDir, 'initial.png') })
  assertNonBlankPng(path.join(artifactDir, 'initial.png'))

  await pressSampled(page, 'KeyJ')
  let events = await hookValue(page, () => window.__combatCoreSlice.getEvents())
  let cues = await hookValue(page, () => window.__combatCoreSlice.getPresentationCues())
  const whiff = events.find((event) => event.type === 'attack-started')
  assert(whiff)
  assert(!events.some((event) => event.type === 'hit-confirmed'))
  const whiffSwing = cues.find((cue) => cue.type === 'swing')
  assert(whiffSwing?.payload.sound)
  assert(whiffSwing?.payload.effect)
  timeline.push({ scenario: 'normal', milestone: 'whiff', event: eventSummary(whiff), cue: cueSummary(whiffSwing) })

  const bundle = await hookValue(page, () => window.__combatCoreSlice.captureBugBundle())
  assertCombatCoreBugBundle(bundle, expectedBugBundle)
  writeJson('whiff-bug-bundle.json', bundle)
  fs.writeFileSync(
    path.join(artifactDir, 'whiff-bug-bundle.png'),
    Buffer.from(bundle.screenshot.replace(/^data:image\/png;base64,/, ''), 'base64'),
  )
  assertNonBlankPng(path.join(artifactDir, 'whiff-bug-bundle.png'))
  timeline.push({ scenario: 'normal', milestone: 'bug-bundle' })

  const attackId = (await hookValue(page, () => window.__combatCoreSlice.getSnapshot())).actors[0].attackId
  await pressSampled(page, 'KeyJ')
  const busySnapshot = await hookValue(page, () => window.__combatCoreSlice.getSnapshot())
  events = await hookValue(page, () => window.__combatCoreSlice.getEvents())
  const busy = events.find((event) => event.type === 'command-rejected' && event.reason === 'busy')
  assert(busy)
  assert.equal(busySnapshot.actors[0].attackId, attackId)
  timeline.push({ scenario: 'normal', milestone: 'busy', event: eventSummary(busy) })

  await page.waitForFunction(() => {
    const hero = window.__combatCoreSlice.getSnapshot().actors[0]
    return !hero.attacking && hero.comboStage === null
  }, undefined, { timeout: 5_000 })
  await pressSampled(page, 'KeyK')
  assert.notEqual((await hookValue(page, () => window.__combatCoreSlice.getSnapshot())).actors[0].y, 400)
  const airborneEventCount = (await hookValue(page, () => window.__combatCoreSlice.getEvents())).length
  await pressSampled(page, 'KeyJ')
  events = await hookValue(page, () => window.__combatCoreSlice.getEvents())
  cues = await hookValue(page, () => window.__combatCoreSlice.getPresentationCues())
  const airborne = events.slice(airborneEventCount).find((event) => event.type === 'attack-started' && event.airborne)
  assert(airborne)
  const airborneSwing = cues.findLast((cue) => cue.type === 'swing')
  assert.equal(airborneSwing.payload.action, 'hit1')
  assert.equal(airborneSwing.payload.effect, 'hit3')
  assert.equal(airborneSwing.payload.sound, 'hit12')
  timeline.push({ scenario: 'normal', milestone: 'airborne-swing', event: eventSummary(airborne), cue: cueSummary(airborneSwing) })
  await page.waitForFunction(
    () => window.__combatCoreSlice.getSnapshot().actors[0].y === 400,
    undefined,
    { timeout: 5_000 },
  )
  timeline.push({ scenario: 'normal', milestone: 'landed' })

  const movementCommands = (await hookValue(page, () => window.__combatCoreSlice.getCommands())).length
  await page.keyboard.down('KeyD')
  await page.waitForFunction(
    (count) => window.__combatCoreSlice.getCommands().length === count + 1,
    movementCommands,
    { timeout: 2_000 },
  )
  await page.waitForFunction(() => {
    const [hero, monster] = window.__combatCoreSlice.getSnapshot().actors
    return monster.x - hero.x <= 190
  }, undefined, { timeout: 8_000 })
  await page.keyboard.up('KeyD')
  const releaseTick = await hookValue(page, () => window.__combatCoreSlice.getSnapshot().tick)
  await page.waitForFunction(({ count, tick }) => {
    const hook = window.__combatCoreSlice
    return hook.getCommands().slice(count).some((command) => command.type === 'release-right') &&
      hook.getSnapshot().tick > tick
  }, { count: movementCommands, tick: releaseTick }, { timeout: 2_000 })

  const beforeMonsterHit = await hookValue(page, () => {
    const hero = window.__combatCoreSlice.getSnapshot().actors[0]
    return { hp: hero.hp, x: hero.x, eventCount: window.__combatCoreSlice.getEvents().length }
  })
  await page.waitForFunction(({ hp, x }) => {
    const hero = window.__combatCoreSlice.getSnapshot().actors[0]
    return hero.hp === hp - 12 && hero.x !== x
  }, beforeMonsterHit, { timeout: 10_000 })
  const monsterAttackEvents = (await hookValue(page, () => window.__combatCoreSlice.getEvents())).slice(beforeMonsterHit.eventCount)
  writeJson('monster-attack-events.json', monsterAttackEvents)
  timeline.push({
    scenario: 'normal',
    milestone: 'monster-hit',
    events: monsterAttackEvents.map(eventSummary),
  })

  await page.waitForFunction(
    () => window.__combatCoreSlice.getPerformance().interval.count >= 300,
    undefined,
    { timeout: 10_000 },
  )
  const functionalPerformance = await hookValue(page, () => window.__combatCoreSlice.getPerformance())
  assertDistribution(functionalPerformance.work, 'functionalPerformance.work')
  assertDistribution(functionalPerformance.interval, 'functionalPerformance.interval', { withDrops: true })
  assert(functionalPerformance.work.p95Ms <= 16.7)
  writeJson('functional-performance.json', functionalPerformance)
  const normalProof = await hookValue(page, () => window.__combatCoreSlice.getDeterminismProof())
  assert.equal(normalProof.liveHash, normalProof.replayHash)
  const normalPresentationCues = await hookValue(page, () => window.__combatCoreSlice.getPresentationCues())
  timeline.push({ scenario: 'normal', milestone: 'replay-equal' })

  await page.goto(`${origin}/?combatCoreSlice=1&proofScenario=combo`)
  await waitForHook(page, errors)
  timeline.push({ scenario: 'combo', milestone: 'start' })
  await pressSampled(page, 'KeyD')
  assert.equal((await hookValue(page, () => window.__combatCoreSlice.getSnapshot())).actors[0].facing, 1)
  timeline.push({ scenario: 'combo', milestone: 'face-right' })

  for (const action of ['hit1', 'hit2', 'hit3', 'hit4', 'hit5']) {
    await page.waitForFunction(
      () => !window.__combatCoreSlice.getSnapshot().actors[0].attacking,
      undefined,
      { timeout: 5_000 },
    )
    const beforeEvents = (await hookValue(page, () => window.__combatCoreSlice.getEvents())).length
    const beforeCues = (await hookValue(page, () => window.__combatCoreSlice.getPresentationCues())).length
    await pressSampled(page, 'KeyJ')
    await page.waitForFunction(({ beforeEvents, action }) => {
      const recent = window.__combatCoreSlice.getEvents().slice(beforeEvents)
      return recent.some((event) => event.type === 'attack-started' && event.action === action) &&
        recent.some((event) => event.type === 'damage-applied' && event.amount === 32)
    }, { beforeEvents, action }, { timeout: 3_000 })
    const recentEvents = (await hookValue(page, () => window.__combatCoreSlice.getEvents())).slice(beforeEvents)
    const recentCues = (await hookValue(page, () => window.__combatCoreSlice.getPresentationCues())).slice(beforeCues)
    const attack = recentEvents.find((event) => event.type === 'attack-started')
    const damage = recentEvents.find((event) => event.type === 'damage-applied')
    assert.equal(attack.action, action)
    assert.equal(damage.amount, 32)
    const currentView = await hookValue(page, () => window.__combatCoreSlice.getViewState())
    assert.equal(currentView.weaponVisible, true)
    assert.equal(String(currentView.weaponFrame), String(currentView.heroFrame))
    const swing = recentCues.find((cue) => cue.type === 'swing')
    const impact = recentCues.find((cue) => cue.type === 'impact')
    assert(swing?.payload.sound && swing?.payload.effect)
    assert.equal(impact?.payload.hitStopMs, 50)
    timeline.push({
      scenario: 'combo', milestone: action,
      events: recentEvents.filter((event) => ['attack-started', 'damage-applied'].includes(event.type)).map(eventSummary),
      cues: recentCues.filter((cue) => ['swing', 'impact'].includes(cue.type)).map(cueSummary),
    })
  }

  await page.waitForFunction(
    () => window.__combatCoreSlice.getEvents().some((event) => event.type === 'actor-defeated'),
    undefined,
    { timeout: 3_000 },
  )
  await page.waitForFunction(
    () => window.__combatCoreSlice.getViewState().monsterAnimation === 'monster7_dead',
    undefined,
    { timeout: 3_000 },
  )
  timeline.push({ scenario: 'combo', milestone: 'defeated-dead' })
  await page.waitForFunction(
    () => window.__combatCoreSlice.getEvents().some((event) => event.type === 'actor-removed') &&
      window.__combatCoreSlice.getViewState().monsterVisible === false,
    undefined,
    { timeout: 3_000 },
  )
  timeline.push({ scenario: 'combo', milestone: 'removed' })
  const comboProof = await hookValue(page, () => window.__combatCoreSlice.getDeterminismProof())
  assert.equal(comboProof.liveHash, comboProof.replayHash)
  timeline.push({ scenario: 'combo', milestone: 'replay-equal' })
  const comboArtifacts = await hookValue(page, () => ({
    snapshot: window.__combatCoreSlice.getSnapshot(),
    commands: window.__combatCoreSlice.getCommands(),
    events: window.__combatCoreSlice.getEvents(),
    presentationCues: window.__combatCoreSlice.getPresentationCues(),
    viewState: window.__combatCoreSlice.getViewState(),
  }))
  writeJson('combo-events.json', comboArtifacts)
  writeJson('presentation-cues.json', {
    normal: normalPresentationCues,
    combo: comboArtifacts.presentationCues,
  })
  await page.screenshot({ path: path.join(artifactDir, 'combo-final.png') })
  assertNonBlankPng(path.join(artifactDir, 'combo-final.png'))

  writeJson('video-timeline-candidate.json', timeline)
  await page.close()
  const videoPath = await video.path()
  await context.close()
  const proofPath = path.join(artifactDir, 'proof.webm')
  fs.renameSync(videoPath, proofPath)
  assert(fs.statSync(proofPath).size >= 100 * 1024, 'proof video must be at least 100 KiB')
  return { timeline, functionalPerformance }
}

async function runVisualProof(browser, origin, errors) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
  const candidates = []
  for (const mode of modes) {
    const page = await context.newPage()
    capturePageErrors(page, `visual-${mode}`, errors)
    await page.goto(`${origin}/?combatCoreSlice=1&visualBaseline=${mode}`)
    await waitForHook(page, errors)
    await waitForLoadingOverlay(page)
    const file = path.join(artifactDir, `visual-candidate-${mode}.png`)
    await page.screenshot({ path: file })
    assertNonBlankPng(file)
    candidates.push({ mode, file, bytes: fs.readFileSync(file) })
    await page.close()
  }

  if (!updateBaseline && !candidateOnly) {
    for (const candidate of candidates) {
      const baselineFile = path.join(baselineDir, `combat-core-slice-${candidate.mode}.png`)
      const baseline = readPng(baselineFile)
      const actual = readPng(candidate.file)
      assert.equal(actual.width, baseline.width)
      assert.equal(actual.height, baseline.height)
      const diff = new PNG({ width: actual.width, height: actual.height })
      const changed = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, { threshold: 0.2 })
      PNG.sync.write(diff)
      fs.writeFileSync(path.join(artifactDir, `visual-diff-${candidate.mode}.png`), PNG.sync.write(diff))
      assert(changed / (actual.width * actual.height) <= 0.02, `${candidate.mode} visual regression exceeded 2%`)
    }
  }

  const defaultPage = await context.newPage()
  capturePageErrors(defaultPage, 'default-route', errors)
  await defaultPage.goto(origin)
  await defaultPage.waitForSelector('#app canvas', { timeout: 15_000 })
  await waitForLoadingOverlay(defaultPage)
  assert.equal(await defaultPage.evaluate(() => window.__combatCoreSlice), undefined)
  const defaultFile = path.join(artifactDir, 'default-route.png')
  await defaultPage.screenshot({ path: defaultFile })
  assertNonBlankPng(defaultFile)
  await defaultPage.close()
  await context.close()
  return candidates.map((candidate) => ({
    destination: path.join(baselineDir, `combat-core-slice-${candidate.mode}.png`),
    bytes: candidate.bytes,
  }))
}

async function runPerformanceProof(browser, origin, errors) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  capturePageErrors(page, 'performance', errors)
  await page.goto(`${origin}/?combatCoreSlice=1`)
  await waitForHook(page, errors)
  await page.waitForFunction(
    () => window.__combatCoreSlice.getPerformance().interval.count >= 600,
    undefined,
    { timeout: 20_000 },
  )
  const performanceResult = await hookValue(page, () => window.__combatCoreSlice.getPerformance())
  assertDistribution(performanceResult.work, 'performance.work')
  assertDistribution(performanceResult.interval, 'performance.interval', { withDrops: true })
  const browserEnvironment = await page.evaluate(() => {
    const canvas = document.querySelector('#app canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    const bounds = canvas.getBoundingClientRect()
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceScaleFactor: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      canvasBacking: { width: canvas.width, height: canvas.height },
      canvasClient: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      webglVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR) ?? null,
      webglRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? null,
    }
  })
  const environment = {
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    chromiumVersion: browser.version(),
    ...browserEnvironment,
  }
  writeJson('performance.json', performanceResult)
  writeJson('performance-environment.json', environment)
  if (windowsReference) {
    assert.equal(process.platform, 'win32')
    assert.deepEqual(environment.viewport, { width: 1920, height: 1080 })
    assert.equal(environment.deviceScaleFactor, 1)
    assert.deepEqual(environment.canvasBacking, { width: 960, height: 540 })
    assert.equal(Math.round(environment.canvasClient.width), 1920)
    assert.equal(Math.round(environment.canvasClient.height), 1080)
    assert(performanceResult.work.count >= 600)
    assert(performanceResult.interval.count >= 600)
    assert(performanceResult.work.p95Ms <= 16.7)
    assert(performanceResult.interval.p95Ms <= 16.7)
    assert(performanceResult.interval.droppedFrameRate <= 0.01)
  }
  await page.close()
  await context.close()
  return { performance: performanceResult, environment }
}

let preview
let browser
try {
  fs.rmSync(artifactDir, { recursive: true, force: true })
  fs.mkdirSync(artifactDir, { recursive: true })
  const port = await reservePort()
  const npm = npmInvocation([
    'run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ])
  preview = spawn(npm.command, npm.args, {
    cwd: gameRoot,
    stdio: 'ignore',
  })
  const origin = `http://127.0.0.1:${port}`
  await waitForOrigin(origin)
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  const angleBackend = process.env.PLAYWRIGHT_ANGLE_BACKEND ?? 'swiftshader'
  assert(['swiftshader', 'd3d11'].includes(angleBackend), `unsupported ANGLE backend: ${angleBackend}`)
  browser = await chromium.launch(executablePath ? {
    executablePath,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      ...(angleBackend === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu']),
      `--use-angle=${angleBackend}`,
    ],
  } : {})
  const errors = []
  let functional
  let visualBaselineEntries = []
  if (!perfOnly) {
    functional = await runFunctionalProof(browser, origin, errors)
    visualBaselineEntries = await runVisualProof(browser, origin, errors)
    const timelineBaseline = path.join(baselineDir, 'combat-core-slice-video-timeline.json')
    if (!updateBaseline && !candidateOnly) {
      assert.deepEqual(functional.timeline, JSON.parse(fs.readFileSync(timelineBaseline, 'utf8')))
    }
  }
  const performanceResult = await runPerformanceProof(browser, origin, errors)
  assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`)
  if (updateBaseline) {
    commitFileSet([
      ...visualBaselineEntries,
      {
        destination: path.join(baselineDir, 'combat-core-slice-video-timeline.json'),
        bytes: Buffer.from(`${JSON.stringify(functional.timeline, null, 2)}\n`),
      },
    ])
  }

  const machineResult = {
    kind: 'combat-core-performance-result',
    windowsReference: windowsReference ? 'PASS' : 'NOT-RUN',
    performance: performanceResult.performance,
    environment: performanceResult.environment,
  }
  if (jsonOutput) console.log(JSON.stringify(machineResult))
  if (!perfOnly) {
    console.log('combat-core-slice: PASS')
    console.log('default-route: isolated')
    console.log(candidateOnly ? 'visual-regression: candidate-only' : 'visual-regression: within threshold')
    console.log(`render-work-p95-functional: ${functional.functionalPerformance.work.p95Ms.toFixed(3)}ms <= 16.7ms`)
    console.log('render-interval-p95-windows: <= 16.7ms when reference gate runs')
    console.log(`windows-reference: ${machineResult.windowsReference}${windowsReference ? '' : ' (local telemetry only)'}`)
    console.log('whiff: attack-started without hit-confirmed')
    console.log('mash: busy commands rejected')
    console.log('movement: jump and landing verified')
    console.log('monster-damage: 12')
    console.log('combo: hit1-hit5, 32 damage each')
    console.log('death: defeated-dead-removed')
    console.log('replay: normal and combo hashes equal')
    console.log('bug-bundle: complete')
    console.log('artifacts: tmp/combat-core-slice')
  }
} finally {
  await browser?.close().catch(() => undefined)
  if (preview && preview.exitCode === null) preview.kill('SIGTERM')
}
