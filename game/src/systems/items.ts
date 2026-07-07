// Crafting effect DSL — mirrors the schema agent-server's craft_item tool
// produces (see agent-server/src/craft-validate.ts), so an NPC-crafted
// equip's effects can be attached to an Item unchanged.
export type Effect =
  | { type: 'stat'; stat: 'atk' | 'def' | 'hp' | 'mp' | 'crit'; value: number }
  | { type: 'onHit'; effect: 'burn' | 'lifesteal' | 'freeze'; chance: number; power: number }

export interface Item {
  id: string
  name: string
  kind: 'material' | 'equip' | 'consumable'
  rarity: 1 | 2 | 3
  effects?: Effect[]
}
