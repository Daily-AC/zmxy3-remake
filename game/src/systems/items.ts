export interface Item {
  id: string
  name: string
  kind: 'material' | 'equip' | 'consumable'
  rarity: 1 | 2 | 3
}
