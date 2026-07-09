import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('BattleScene pickup wiring', () => {
  it('passes heroVisualCenter().y to stepDrops instead of the flat GROUND_Y constant', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(
      /const heroCenter = this\.heroVisualCenter\(\)\s+const \{ remaining, picked \} = stepDrops\(this\.drops, this\.heroState\.x, heroCenter\.y, this\.pickupCfg\)/,
    )
  })

  it('spawns collectible soul drops on monster death and routes picked souls into soulPurse', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/spawnSoulDrop\(monsterSoulDropAmount\(species, this\.dropRollContext\(\)\), x, y\)/)
    expect(source).toMatch(/if \(pickedDrop\.kind === 'soul'\)\s*{\s*addSoul\(this\.soulPurse, pickedDrop\.amount\)/)
  })

  it('passes the current AS3 stage/level context into rollDrops', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/rollDrops\(species, Math\.random, this\.dropRollContext\(\)\)/)
  })

  it('spawns AS3 cure pickups on death and applies them through collectWorldPickup', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/const medicineDrop = rollMedicineDrop\(Math\.random\)/)
    expect(source).toMatch(/spawnConsumableDrop\(medicineDrop, x, y\)/)
    expect(source).toMatch(/collectWorldPickup\(\s*pickedDrop\.consumableId,/)
  })

  it('passes current hero level into monsterExp for Monster30 level-10 anti-farm gating', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/monsterExp\(species, \{ heroLevel: this\.identity\.progression\.level \}\)/)
  })

  it('routes Monster30 projectile-spawn through enemy projectile entities before damaging the hero', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/rangedAttack: species === 'monster30' \? MONSTER30_BULLET : undefined/)
    expect(source).toMatch(/ev\.type === 'projectile-spawn'\) this\.spawnMonsterProjectile\(e, ev\)/)
    expect(source).toMatch(/stepEnemyProjectiles\(\s*this\.enemyProjectiles,/)
    expect(source).toMatch(/damageHero\(this\.identity, heroHit, this\.simClockMs\)/)
  })
})
