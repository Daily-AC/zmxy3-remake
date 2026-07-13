import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import golden from './fixtures/combat-core-slice-legacy-golden.json'
import {
  runLegacyCombatSliceTrace,
  type LegacyCombatCommand,
  type LegacySliceDefinition,
} from '../src/adapters/legacyCombatSliceOracle'

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

describe('legacy combat slice golden trace', () => {
  it('keeps the immutable capture byte-identical to the approved baseline', () => {
    expect(sha256File(path.resolve(process.cwd(), 'tests/fixtures/combat-core-slice-legacy-golden.json')))
      .toBe('1edbc96b0a33d0cd509330a67a767e246431bcf5240a149026092f6c2f350fe4')
    expect(golden.metadata).toEqual({
      baselineCommit: 'bdf9405726eea6c209d48f720fed8a95c815dfc7',
      battleSceneSourceHash: 'c540cbec196b76c14ce42bab5918a2f498ed7d21f8d70a8d8a377ae4ae817404',
      oracleSourceHash: '2fc2f7f73507759fa9296b04615ec490e51774bf47ef028cdf5144b37261f718',
    })
  })

  it('matches current approved sources against a separate manifest', () => {
    const manifest = JSON.parse(readFileSync(
      path.resolve(process.cwd(), 'tests/fixtures/legacy-combat-slice-current-sources.json'),
      'utf8',
    )) as { battleSceneSourceHash: string; oracleSourceHash: string }
    expect(manifest).toEqual({
      battleSceneSourceHash: sha256File(path.resolve(process.cwd(), 'src/scenes/BattleScene.ts')),
      oracleSourceHash: sha256File(path.resolve(process.cwd(), 'src/adapters/legacyCombatSliceOracle.ts')),
    })
  })

  it('reproduces every immutable legacy frame and final hash', () => {
    expect(golden.seed).toBe(golden.definition.seed)
    expect(golden.totalTicks).toBe(180)
    expect(golden.frames).toHaveLength(180)

    const trace = runLegacyCombatSliceTrace(
      golden.definition as unknown as LegacySliceDefinition,
      golden.commands as readonly LegacyCombatCommand[],
      golden.totalTicks,
    )

    expect(trace.frames).toEqual(golden.frames)
    expect(trace.finalHash).toBe(golden.finalHash)
    expect(trace.finalHash).toBe('e99f9023')
  })
})
