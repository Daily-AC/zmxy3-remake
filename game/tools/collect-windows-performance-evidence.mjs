import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { combatCoreSourceDigest } from './combat-core-source-digest.mjs'
import {
  assertDistribution,
  assertSimulationRun,
  npmInvocation,
  stripAnsi,
} from './combat-core-verification-lib.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const evidencePath = path.join(repoRoot, 'docs/reports/evidence/combat-core-slice-windows-performance.json')

function run(command, args, cwd = repoRoot) {
  const invocation = command === 'npm' ? npmInvocation(args) : { command, args }
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    maxBuffer: 64 * 1024 * 1024,
  })
  assert.equal(result.error, undefined, `${command} failed to start: ${result.error?.message}`)
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

function parseJsonLine(output, predicate) {
  const parsed = stripAnsi(output).split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{'))
    .map((line) => { try { return JSON.parse(line) } catch { return null } })
    .find(predicate)
  assert(parsed, `missing JSON summary in output:\n${output}`)
  return parsed
}

assert.equal(process.platform, 'win32', 'Windows performance evidence must be collected on win32')
assert.equal(run('git', ['status', '--porcelain']).trim(), '', 'source worktree must be clean before evidence capture')

const simulationRuns = Array.from({ length: 3 }, () => parseJsonLine(
  run('npm', ['run', 'bench', '-w', '@zaixu/game-core']),
  (value) => value?.actors === 51 && value?.measuredTicks === 600,
))
simulationRuns.forEach((run, index) => assertSimulationRun(run, `simulationRuns[${index}]`))
const browserResult = parseJsonLine(
  run('npm', ['run', 'verify:combat-core', '-w', 'zmxy3-game', '--', '--windows-reference', '--perf-only', '--json']),
  (value) => value?.kind === 'combat-core-performance-result',
)
assert.equal(browserResult.windowsReference, 'PASS')
assertDistribution(browserResult.performance.work, 'browser.work')
assertDistribution(browserResult.performance.interval, 'browser.interval', { withDrops: true })

const evidence = {
  schemaVersion: 1,
  status: 'PASS',
  testedGitCommit: run('git', ['rev-parse', 'HEAD']).trim(),
  sourceDigest: combatCoreSourceDigest().digest,
  simulationRuns,
  browser: browserResult.performance,
  environment: browserResult.environment,
}
fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
const temporary = `${evidencePath}.${process.pid}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`)
fs.renameSync(temporary, evidencePath)
console.log(`combat-core-windows-performance-evidence: ${evidencePath}`)
