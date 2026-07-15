import type { BattleDefinition } from '../../src/battle/types'
import { makeSessionDefinition } from '../fixtures/makeSessionDefinition'

export function makeBattleDefinition(): BattleDefinition {
  const session = makeSessionDefinition({ monsterX: 600, monsterAttackRate: 0 })
  const { id: _id, spawn: _spawn, ...monster } = session.monsters[0]

  return {
    version: 1,
    contentVersion: 'battle-test@1',
    tickRate: 30,
    seed: 7,
    provenance: session.provenance,
    hero: {
      ...session.hero,
      maxMp: 50,
      skills: {},
      spawn: { x: 100, y: 400 },
      groundY: 400,
      minX: 0,
      maxX: 1000,
    },
    monsters: { monster30: monster },
    level: {
      id: 'sl11',
      bounds: { left: 0, right: 1000, top: -2000, bottom: 500 },
      heroSpawn: { x: 100, y: 400 },
      walls: [{ type: 'solid', x: 0, y: 400, width: 1000, height: 40 }],
      encounters: [{
        kind: 'continuous',
        id: 'continuous-0',
        initialDelayTicks: 90,
        intervalTicks: 180,
        count: 2,
        roster: ['monster30'],
        spawnOffset: {
          x: { min: -150, max: 150 },
          y: { min: -300, max: -100 },
        },
        trigger: {
          kind: 'hero-height',
          atOrAboveY: -1900,
          boss: { speciesId: 'monster30', x: 750, y: -1872.45 },
        },
      }],
      door: { x: 700, y: -1980, width: 180, height: 160 },
    },
  }
}
