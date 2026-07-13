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
  it('reproduces every accepted legacy frame without rewriting provenance metadata', () => {
    expect(golden.metadata).toEqual({
      baselineCommit: 'bdf9405726eea6c209d48f720fed8a95c815dfc7',
      battleSceneSourceHash: sha256File(path.resolve(process.cwd(), 'src/scenes/BattleScene.ts')),
      oracleSourceHash: sha256File(path.resolve(process.cwd(), 'src/adapters/legacyCombatSliceOracle.ts')),
    })
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
