import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { combatCoreSourceDigest } from './combat-core-source-digest.mjs'
import {
  assertDistribution,
  assertFiniteNonNegative,
  assertNonNegativeInteger,
  assertSimulationRun,
} from './combat-core-verification-lib.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const evidencePath = path.join(repoRoot, 'docs/reports/evidence/combat-core-slice-windows-performance.json')

export function verifyWindowsPerformanceEvidence(evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))) {
  assert.equal(evidence.schemaVersion, 1)
  assert.equal(evidence.status, 'PASS')
  assert.match(evidence.testedGitCommit, /^[0-9a-f]{40}$/)
  assert(Array.isArray(evidence.simulationRuns), 'simulationRuns must be an array')
  assert.equal(evidence.simulationRuns.length, 3)
  evidence.simulationRuns.forEach((run, index) => {
    assertSimulationRun(run, `simulationRuns[${index}]`)
    assert.equal(run.actors, 51)
    assert.equal(run.warmupTicks, 120)
    assert.equal(run.measuredTicks, 600)
    assert(run.p95Ms <= 5, `simulation p95 exceeded: ${run.p95Ms}`)
  })

  const { browser, environment } = evidence
  assert(browser !== null && typeof browser === 'object', 'browser must be an object')
  assertDistribution(browser.work, 'browser.work')
  assertDistribution(browser.interval, 'browser.interval', { withDrops: true })
  assert(environment !== null && typeof environment === 'object', 'environment must be an object')
  assert.equal(environment.platform, 'win32')
  assert.match(environment.chromiumVersion, /\d+/)
  assertNonNegativeInteger(environment.viewport?.width, 'environment.viewport.width')
  assertNonNegativeInteger(environment.viewport?.height, 'environment.viewport.height')
  assert.deepEqual(environment.viewport, { width: 1920, height: 1080 })
  assertFiniteNonNegative(environment.deviceScaleFactor, 'environment.deviceScaleFactor')
  assert.equal(environment.deviceScaleFactor, 1)
  assertNonNegativeInteger(environment.canvasBacking?.width, 'environment.canvasBacking.width')
  assertNonNegativeInteger(environment.canvasBacking?.height, 'environment.canvasBacking.height')
  assert.deepEqual(environment.canvasBacking, { width: 960, height: 540 })
  assertFiniteNonNegative(environment.canvasClient?.x, 'environment.canvasClient.x')
  assertFiniteNonNegative(environment.canvasClient?.y, 'environment.canvasClient.y')
  assertFiniteNonNegative(environment.canvasClient?.width, 'environment.canvasClient.width')
  assertFiniteNonNegative(environment.canvasClient?.height, 'environment.canvasClient.height')
  assert.equal(Math.round(environment.canvasClient.width), 1920)
  assert.equal(Math.round(environment.canvasClient.height), 1080)
  assert(browser.work.count >= 600)
  assert(browser.interval.count >= 600)
  assert(browser.work.p95Ms <= 16.7)
  assert(browser.interval.p95Ms <= 16.7)
  assert(browser.interval.droppedFrameRate <= 0.01)
  assert.equal(evidence.sourceDigest, combatCoreSourceDigest().digest, 'Windows evidence source digest is stale')
  return evidence
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyWindowsPerformanceEvidence()
  console.log('combat-core-windows-performance-evidence: PASS')
}
