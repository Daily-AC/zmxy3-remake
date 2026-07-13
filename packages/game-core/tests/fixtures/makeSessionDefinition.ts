import { defineContentId } from '@zaixu/content'
import type { CombatSessionDefinition, HeroCombatDefinition } from '../../src/session/types'

export interface MakeSessionDefinitionOverrides {
  monsterX?: number
  monsterHp?: number
  monsterAttackRate?: number
}

export function makeSessionDefinition(
  overrides: MakeSessionDefinitionOverrides = {},
): CombatSessionDefinition {
  return {
    version: 1,
    contentVersion: 'combat-test@1',
    tickRate: 30,
    seed: 7,
    provenance: [
      { ruleId: 'simulation.tick-rate', origin: 'canonical', source: 'existing 30 Hz simulation' },
      { ruleId: 'combat.hitbox', origin: 'adapted', source: 'explicit AABB slice contract' },
    ],
    hero: {
      id: 'hero-1',
      contentId: defineContentId('character.zaixu.wukong'),
      spawn: { x: 100, y: 400 },
      collisionOffset: { x: 0, y: 0 },
      groundY: 400,
      minX: 0,
      maxX: 1000,
      maxHp: 120,
      atk: 36,
      def: 2,
      magicDefenseFraction: 0,
      critChance: 0,
      comboStageDurationsMs: [300, 300, 300, 1600 / 3, 1600 / 3],
      comboGraceMs: 1500,
      normalAttacks: Object.fromEntries(
        ['hit1', 'hit2', 'hit3', 'hit4', 'hit5'].map((action) => [
          action,
          { action, hitFrameFractions: [0], hitbox: { forward: 85, y: 0, width: 130, height: 150 } },
        ]),
      ) as unknown as HeroCombatDefinition['normalAttacks'],
      hurtbox: { width: 90, height: 150 },
      hurtDurationMs: 260,
      respawnDelayMs: 1500,
    },
    monsters: [{
      id: 'monster-1',
      contentId: defineContentId('monster.chapter1.monster7'),
      spawn: { x: overrides.monsterX ?? 800, y: 400 },
      collisionOffset: { x: 0, y: 0 },
      stats: {
        hp: overrides.monsterHp ?? 150,
        speed: 3,
        attackRange: 250,
        alertRange: 1000,
        normalAttackRate: overrides.monsterAttackRate ?? 0,
        def: 4,
      },
      patrolMin: 700,
      patrolMax: 900,
      hurtDurationMs: 500,
      attackDurationMs: 1000 / 3,
      deadDurationMs: 500,
      attackCooldownMs: 1000,
      decisionIntervalMs: 1000,
      attack: {
        action: 'hit1',
        hitFrameFractions: [0.6],
        hitbox: { forward: 80, y: -86, width: 160, height: 150 },
      },
      attackPower: 14,
      attackKind: 'physics',
      hurtbox: { width: 90, height: 150 },
      targetOffsetX: 7.5,
      selfOffsetX: 4.5,
    }],
  }
}
