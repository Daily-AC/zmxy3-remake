import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

describe('BattleScene coop integration wiring', () => {
  it('initializes and disposes a coop channel only when coopSession is present', () => {
    const battle = source()

    expect(battle).toMatch(/private startCoopSync\(\): void/)
    expect(battle).toMatch(/if \(!this\.coopSession\) return/)
    expect(battle).toMatch(/new CoopChannel\(createSocialRoomTransport\(this\.coopConnection\)\)/)
    expect(battle).toMatch(/this\.events\.once\(Phaser\.Scenes\.Events\.SHUTDOWN, \(\) => \{[\s\S]*this\.disposeCoopSync\(\)/)
  })

  it('broadcasts local hero state and renders remote hero puppets from interpolation samples', () => {
    const battle = source()

    expect(battle).toMatch(/private updateCoop\(delta: number\): void/)
    expect(battle).toMatch(/this\.coopChannel\.sendHeroState\(/)
    expect(battle).toMatch(/private updateRemoteHeroPuppets\(\): void/)
    expect(battle).toMatch(/interpolatePosition\(view\.positionSamples, Date\.now\(\)\)/)
    expect(battle).toMatch(/this\.add\.sprite\(0, 0, HERO_TEX\)/)
  })

  it('keeps monster simulation host-authoritative in both level update paths', () => {
    const battle = source()

    expect(battle).toMatch(/private updateCoopMonsters\(delta: number, heroAlive: boolean\): void/)
    expect(battle).toMatch(/if \(this\.coopSession && !this\.coopSession\.isHost\) \{[\s\S]*this\.applyRemoteMonsterSnapshots\(delta\)/)
    expect(battle).toMatch(/else this\.updateCoopMonsters\(delta, heroAlive\)/)
    expect(battle).toMatch(/private broadcastMonsterState\(includeRecentlyDead = false\): void/)
  })

  it('routes peer hits as hit-intent events and host boss clear as a level event', () => {
    const battle = source()

    expect(battle).toMatch(/private queueOrSendHeroHit\(target: MonsterEntity, attackId: number, damage: number\): boolean/)
    expect(battle).toMatch(/this\.coopChannel\?\.sendHitIntent\(/)
    expect(battle).toMatch(/this\.coopChannel\.send\(encodeLevelEvent\(\{ kind: 'boss_defeated' \}\)\)/)
    expect(battle).toMatch(/private mirrorBossDefeated\(\): void/)
  })

  it('lets the host hit remote hero snapshots with melee and skill hitboxes', () => {
    const battle = source()

    expect(battle).toMatch(/private sendRemoteHeroHits\(/)
    expect(battle).toMatch(/selectRemoteHeroHitTargets\(/)
    expect(battle).toMatch(/private resolveMonsterAttackFrame\([\s\S]*this\.sendRemoteHeroHits\(/)
    expect(battle).toMatch(/private resolveEnemySkillHit\([\s\S]*this\.sendRemoteHeroHits\(/)
  })

  it('applies received host hero hits only on peers with payload deduplication', () => {
    const battle = source()

    expect(battle).toMatch(/effect\.type === 'hero_hit_received'[\s\S]*this\.applyRemoteHeroHit\(effect\.hit\)/)
    expect(battle).toMatch(/private coopReceivedHeroHitIds = new Set<string>\(\)/)
    expect(battle).toMatch(/if \(this\.coopSession\.isHost\) return/)
    expect(battle).toMatch(/resolveCoopHeroHitDamage\(/)
    expect(battle).toMatch(/damageHero\(this\.identity, hit, this\.simClockMs\)/)
  })
})
