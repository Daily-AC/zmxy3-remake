import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL_LEGACY_COMMANDS,
  createLegacyCombatSliceDefinition,
  runLegacyCombatSliceTrace,
} from '../src/adapters/legacyCombatSliceOracle'

const gameRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(gameRoot, '..')

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

const definition = createLegacyCombatSliceDefinition()
const totalTicks = 180
const trace = runLegacyCombatSliceTrace(definition, CANONICAL_LEGACY_COMMANDS, totalTicks)
const fixture = {
  version: 1,
  metadata: {
    baselineCommit: git('rev-parse', 'hackathon-2026-final^{commit}'),
    battleSceneSourceHash: git('hash-object', 'game/src/scenes/BattleScene.ts'),
    oracleSourceHash: git('hash-object', 'game/src/adapters/legacyCombatSliceOracle.ts'),
  },
  seed: definition.seed,
  definition,
  commands: CANONICAL_LEGACY_COMMANDS,
  totalTicks,
  frames: trace.frames,
  finalHash: trace.finalHash,
}

const fixturePath = path.join(gameRoot, 'tests/fixtures/combat-core-slice-legacy-golden.json')
const allowCanonicalRegeneration = process.env.ALLOW_CANONICAL_GOLDEN_REGEN === '1'
if (existsSync(fixturePath) && !allowCanonicalRegeneration) {
  throw new Error(`refusing to overwrite immutable legacy fixture: ${fixturePath}`)
}
writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n')
console.log(JSON.stringify({ fixturePath, frames: trace.frames.length, finalHash: trace.finalHash }))
