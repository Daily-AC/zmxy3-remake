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

    expect(source).toMatch(/spawnSoulDrop\(monsterSoulDropAmount\(species, context\), x, y\)/)
    expect(source).toMatch(/if \(pickedDrop\.kind === 'soul'\)\s*{\s*addSoul\(this\.soulPurse, pickedDrop\.amount\)/)
  })

  it('passes the current AS3 stage/level context into rollDrops', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/const context = this\.dropRollContext\(\)/)
    expect(source).toMatch(/rollDrops\(species, Math\.random, context\)/)
  })

  it('appends L1 starter rewards as real offset world pickups after ordinary drops', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')
    const spawnDrops = source.slice(source.indexOf('private spawnDrops('), source.indexOf('private dropRollContext('))

    expect(source).toMatch(/import \{ l1StarterRewards \} from '\.\.\/systems\/starterRewards'/)
    expect(spawnDrops).toMatch(/const context = this\.dropRollContext\(\)/)
    expect(spawnDrops).toMatch(/rollDrops\(species, Math\.random, context\)/)
    expect(spawnDrops).toMatch(
      /l1StarterRewards\(species, context\)\.forEach\(\(\{ item, qty \}, index\) => \{\s*const drop = spawnDrop\(item, qty, x \+ \(index - 1\) \* 34, y\)\s*this\.drops\.push\(drop\)\s*this\.dropSprites\.set\(drop, this\.makeDropSprite\(drop\)\)/,
    )
    expect(spawnDrops.indexOf('l1StarterRewards(')).toBeGreaterThan(spawnDrops.indexOf('rollDrops('))
  })

  it('labels the no-book beginner recipe without presenting a fake inventory book', () => {
    const source = readFileSync(new URL('../src/ui/hud/FurnaceRecipeView.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/const book = recipe\.requiresBook \? recipe\.bookName : '无需制作书'/)
    expect(source).toMatch(/return `\$\{book\} · \$\{mats\.join\(' · '\)\} · 灵魂 \$\{recipe\.soulCost\}`/)
  })

  it('seeds every persisted battle subsystem from one fresh slot snapshot', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')
    const seedFromSave = source.slice(source.indexOf('private seedFromSave('), source.indexOf('private learnedSkillLevels('))

    expect(source).toMatch(/import \{ loadBattleSaveSeed \} from '\.\.\/systems\/battleSaveSeed'/)
    expect(seedFromSave.match(/loadBattleSaveSeed\(/g)).toHaveLength(1)
    expect(seedFromSave).toMatch(/const seed = loadBattleSaveSeed\(/)
    expect(seedFromSave).toMatch(/const loaded = seed\.loaded/)
    expect(seedFromSave).toMatch(/this\.identity\.progression = loaded\.progression/)
    expect(seedFromSave).toMatch(/this\.equipment = loaded\.equipment/)
    expect(seedFromSave).toMatch(/this\.inventory = loaded\.inventory/)
    expect(seedFromSave).toMatch(/this\.skillTreeState = loaded\.skillTree/)
    expect(seedFromSave).toMatch(/this\.soulPurse = createSoulPurse\(loaded\.soul\)/)
    expect(seedFromSave).toMatch(/this\.playtimeSec = seed\.playtimeSec/)
    expect(seedFromSave).not.toMatch(/const freshEnv =/)
  })

  it('spawns AS3 cure pickups on death and applies them through collectWorldPickup', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/const medicineDrop = rollMedicineDrop\(Math\.random\)/)
    expect(source).toMatch(/spawnConsumableDrop\(medicineDrop, x, y\)/)
    expect(source).toMatch(/collectWorldPickup\(\s*pickedDrop\.consumableId,/)
  })

  it('passes local and remote hero levels into Monster30 anti-farm gating', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/const heroLevels = \[\s*this\.identity\.progression\.level,/)
    expect(source).toMatch(/monsterExp\(species, \{ heroLevel: this\.identity\.progression\.level, heroLevels \}\)/)
  })

  it('routes backpack equip and single-item sell through the validated scene entry points', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/onSellItem: \(item\) => this\.doSellEquipmentItem\(item\)/)
    expect(source).toMatch(/equip\(this\.equipment, this\.inventory, item, this\.identity\.heroId\)/)
    expect(source).toMatch(/sellEquipmentItem\(this\.inventory, this\.soulPurse, item\.id\)/)
    expect(source).toMatch(/id: 'test_chiyan',[\s\S]*sourceType: 'zbwq',[\s\S]*sourceUser: '悟空'/)
  })

  it('routes Monster30 projectile-spawn through enemy projectile entities before damaging the hero', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).toMatch(/rangedAttack: species === 'monster30' \? MONSTER30_BULLET : undefined/)
    expect(source).toMatch(/ev\.type === 'projectile-spawn'\) this\.spawnMonsterProjectile\(e, ev\)/)
    expect(source).toMatch(/stepEnemyProjectiles\(\s*this\.enemyProjectiles,/)
    expect(source).toMatch(/damageHero\(this\.identity, heroHit, this\.simClockMs\)/)
  })

  it('does not show pinyin abbreviation text when a skill cast succeeds', () => {
    const source = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/skillId\.toUpperCase\(\)/)
    expect(source).not.toMatch(/showToast\(`\$\{skillId/)
  })

  it('opens the existing SkillTreeScene from the battle skill dock and resumes battle on return', () => {
    const battle = readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')
    const skillTree = readFileSync(new URL('../src/scenes/SkillTreeScene.ts', import.meta.url), 'utf8')

    expect(battle).toMatch(/else if \(icon === 'jineng'\) this\.openSkillTreeFromBattle\(\)/)
    expect(battle).toMatch(/this\.scene\.launch\(SCENE\.skillTree, \{ returnScene: SCENE\.battle \}\)/)
    expect(battle).toMatch(/this\.scene\.pause\(SCENE\.battle\)/)
    expect(battle).not.toMatch(/技能学习与按键设置/)

    expect(skillTree).toMatch(/returnScene\?: string/)
    expect(skillTree).toMatch(/this\.scene\.resume\(SCENE\.battle\)/)
  })
})
