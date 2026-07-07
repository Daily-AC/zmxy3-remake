import type { Item, Effect } from './items'

export interface BaseStats {
  atk: number
  def: number
  hp: number
  mp: number
  crit: number
}

const CRIT_MAX = 0.8

type StatEffect = Extract<Effect, { type: 'stat' }>
type OnHitEffect = Extract<Effect, { type: 'onHit' }>

function isStatEffect(effect: Effect): effect is StatEffect {
  return effect.type === 'stat'
}

function isOnHitEffect(effect: Effect): effect is OnHitEffect {
  return effect.type === 'onHit'
}

/** Sums stat-type effects from every equipped item onto base stats. Unknown
 * effect types and items with no/empty effects are ignored, not errors. */
export function applyEquipStats(base: BaseStats, equipped: Item[]): BaseStats {
  const result: BaseStats = { ...base }

  for (const item of equipped) {
    const effects = item.effects
    if (!effects || effects.length === 0) continue

    for (const effect of effects) {
      if (!isStatEffect(effect)) continue

      switch (effect.stat) {
        case 'atk':
          result.atk += effect.value
          break
        case 'def':
          result.def += effect.value
          break
        case 'hp':
          result.hp += effect.value
          break
        case 'mp':
          result.mp += effect.value
          break
        case 'crit':
          result.crit += effect.value
          break
        default:
          break
      }
    }
  }

  result.atk = Math.max(0, result.atk)
  result.def = Math.max(0, result.def)
  result.hp = Math.max(0, result.hp)
  result.mp = Math.max(0, result.mp)
  result.crit = Math.min(CRIT_MAX, Math.max(0, result.crit))

  return result
}

/** Rolls every onHit effect on every equipped item independently against
 * `rng()` (hit when rng() < chance, matching dropRoll's convention). Two
 * items with the same proc name can both fire on the same call. */
export function rollOnHitProcs(
  equipped: Item[],
  rng: () => number,
): { effect: OnHitEffect['effect']; power: number }[] {
  const procs: { effect: OnHitEffect['effect']; power: number }[] = []

  for (const item of equipped) {
    const effects = item.effects
    if (!effects || effects.length === 0) continue

    for (const effect of effects) {
      if (!isOnHitEffect(effect)) continue
      if (rng() < effect.chance) {
        procs.push({ effect: effect.effect, power: effect.power })
      }
    }
  }

  return procs
}
