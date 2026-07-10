import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

describe('BattleScene stage-one campaign wiring', () => {
  it('uses 九重天 and 天宫道 as the first two active campaign entries', () => {
    expect(source).toMatch(/const CAMPAIGN: CampaignEntry\[\] = \[LEVEL_1_WUYING, LEVEL_2_TIANGONGDAO,/)
    expect(source).not.toMatch(/const CAMPAIGN: CampaignEntry\[\] = \[LEVEL_1_WUYING, LEVEL_2_TIANWANG,/)
  })

  it('keeps the map-only LaoJun NPC out of native L1/L2 battle scenes', () => {
    expect(source).toMatch(/const BATTLE_NPC_ENABLED = false/)
    expect(source).toMatch(/\.setVisible\(BATTLE_NPC_ENABLED\)/)
    expect(source).toMatch(/private tryOpenDialogue\(\): void \{\s*if \(!BATTLE_NPC_ENABLED\) return/)
  })

  it('shows challenge success for the final stage in any chain without hardcoding sl13', () => {
    expect(source).toMatch(/const isFinalSubStage = this\.level1Chain\.currentIndex === this\.level1Chain\.def\.subStages\.length - 1/)
    expect(source).toMatch(/if \(isFinalSubStage\) this\.showResultBanner\(\)/)
    expect(source).not.toMatch(/if \(stage\.id === 'sl13'\) this\.showResultBanner\(\)/)
  })

  it('labels a portal as an internal substage door only when another substage follows', () => {
    expect(source).toMatch(/const hasFollowingSubStage =\s*this\.level1Chain &&\s*this\.level1Chain\.currentIndex < this\.level1Chain\.def\.subStages\.length - 1/)
    expect(source).toMatch(/const isL1SubStageDoor = Boolean\(hasFollowingSubStage\)/)
  })

  it('maps the first two campaign entries to AS3 stage 1 levels 1 and 2', () => {
    expect(source).toMatch(/if \(this\.campaignIndex === 0\) return \{ stage: 1, level: 1 \}/)
    expect(source).toMatch(/if \(this\.campaignIndex === 1\) return \{ stage: 1, level: 2 \}/)
  })

  it('renders horizontal stage image layers as opaque far base, official foreground and world-locked floor', () => {
    expect(source).toMatch(/setTexture\(stage\.background\.base, '__BASE'\)/)
    expect(source).toMatch(/setScrollFactor\(stage\.background\.scrollFactorX \?\? 0, 0\)/)
    expect(source).toMatch(/stage\.background\.foreground === 'bg12'/)
    expect(source).toMatch(/setTexture\(stage\.background\.floor\)/)
    expect(source).toMatch(/setScrollFactor\(1, 1\)/)
  })

  it('queues official MonsterAppearPoint quantities and drains them under the live cap', () => {
    expect(source).toMatch(/createWaveSpawnQueue\(getActiveWaveRoster\(this\.levelState\)\)/)
    expect(source).toMatch(/const x = spec\.x \?\? /)
    expect(source).toMatch(/this\.spawnEntity\(spec\.species, spec\.stats, x, false, spec\.y\)/)
    expect(source).toMatch(/advanceWaveSpawnQueue\(/)
    expect(source).toMatch(/waveMonsterCapacity\(Boolean\(this\.coopSession\)\)/)
    expect(source).toMatch(/this\.aliveGruntCount\(\) \+ this\.pendingWaveSpawns\.length/)
  })

  it('drops pending queue state synchronously when level objects reset', () => {
    expect(source).toMatch(/this\.pendingWaveSpawns = \[\]/)
  })

  it('applies the current StopPoint as the horizontal hero boundary', () => {
    expect(source).toMatch(/horizontalProgressMaxX\(this\.levelState, stage\.bounds\.right\)/)
    expect(source).toMatch(/this\.heroConfig\.maxX = this\.currentHeroBounds\(\)\.maxX/)
  })
})
