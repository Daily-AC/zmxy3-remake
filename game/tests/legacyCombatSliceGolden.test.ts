import { describe, expect, it } from 'vitest'
import golden from './fixtures/combat-core-slice-legacy-golden.json'
import {
  runLegacyCombatSliceTrace,
  type LegacyCombatCommand,
  type LegacySliceDefinition,
} from '../src/adapters/legacyCombatSliceOracle'

describe('legacy combat slice golden trace', () => {
  it('reproduces every accepted legacy frame without rewriting provenance metadata', () => {
    expect(golden.metadata).toEqual({
      baselineCommit: 'bdf9405726eea6c209d48f720fed8a95c815dfc7',
      battleSceneSourceHash: '2da181c402efafb4a7893befb08123adeab11e30',
      oracleSourceHash: '19fa981bdc312811594777485f5f8e4c2e7a2770',
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
