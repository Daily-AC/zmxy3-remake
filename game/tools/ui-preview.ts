import Phaser from 'phaser'
import { HUD_TEXTURES, HUD_ICONS, ONLINE_TEXTURES, ICON_FALLBACK_KEY } from '../src/ui/hud/hudTheme'
import { RoleInfoHud } from '../src/ui/hud/RoleInfoHud'
import { BossHpBar, MonsterHpBar } from '../src/ui/hud/MonsterHpBar'
import { BackpackWindow } from '../src/ui/hud/BackpackWindow'
import { FurnacePanel } from '../src/ui/hud/FurnacePanel'
import { SkillBarHud, SkillSlotData } from '../src/ui/hud/SkillBarHud'
import { ResultBanner } from '../src/ui/hud/ResultBanner'
import { Toast, spawnFloatingText } from '../src/ui/hud/Toast'
import type { Item } from '../src/systems/items'

// Standalone showcase for the battle-UI components (does not touch the game
// scenes). Each component renders with real extracted art and fake data; the
// bars animate so a capture shows them moving. window.__preview drives states.

const W = 960
const H = 540

const bagItems: { item: Item; qty: number }[] = [
  { item: { id: 'star_blade', name: '流星刃', kind: 'equip', rarity: 3, effects: [{ type: 'stat', stat: 'atk', value: 42 }, { type: 'onHit', effect: 'lifesteal', chance: 0.3, power: 12 }] }, qty: 1 },
  { item: { id: 'iron_claw', name: '玄铁爪', kind: 'equip', rarity: 2, effects: [{ type: 'stat', stat: 'atk', value: 18 }] }, qty: 1 },
  { item: { id: 'guard_boots', name: '护山战靴', kind: 'equip', rarity: 2, effects: [{ type: 'stat', stat: 'def', value: 9 }] }, qty: 1 },
  { item: { id: 'monkey_talisman', name: '猴王护符', kind: 'equip', rarity: 3 }, qty: 1 },
  { item: { id: 'great_pill', name: '大还丹', kind: 'consumable', rarity: 2 }, qty: 8 },
  { item: { id: 'minor_pill', name: '小回气丹', kind: 'consumable', rarity: 1 }, qty: 24 },
  { item: { id: 'spirit_grass', name: '灵芝草', kind: 'material', rarity: 1 }, qty: 13 },
  { item: { id: 'demon_soul', name: '妖魂', kind: 'material', rarity: 3 }, qty: 3 },
  { item: { id: 'silver_ore', name: '银矿', kind: 'material', rarity: 1 }, qty: 40 },
  { item: { id: 'cracked_jade', name: '裂纹玉', kind: 'material', rarity: 2 }, qty: 5 },
  { item: { id: 'beast_fang', name: '妖兽獠牙', kind: 'material', rarity: 1 }, qty: 17 },
  { item: { id: 'moon_dew', name: '月华露', kind: 'material', rarity: 2 }, qty: 6 },
]

class PreviewScene extends Phaser.Scene {
  private hud!: RoleInfoHud
  private boss!: BossHpBar
  private mob!: MonsterHpBar
  private backpack!: BackpackWindow
  private furnace!: FurnacePanel
  private skillbar!: SkillBarHud
  private result!: ResultBanner
  private t = 0
  private floatTimer = 0
  private comboN = 0

  constructor() {
    super('preview')
  }

  preload(): void {
    this.load.setBaseURL('/')
    for (const { key, url } of [...HUD_TEXTURES, ...HUD_ICONS, ...ONLINE_TEXTURES]) {
      if (!this.textures.exists(key)) this.load.image(key, url)
    }
  }

  create(): void {
    // Battle-ish backdrop so the HUD reads like it's over a level.
    const g = this.add.graphics()
    g.fillGradientStyle(0x2a3a5a, 0x2a3a5a, 0x101828, 0x101828, 1).fillRect(0, 0, W, H)
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0xffffff, 0.04).fillCircle(Math.random() * W, Math.random() * H, Math.random() * 40 + 10)
    }

    this.label('RoleInfoHud', 150, 96)
    this.label('BossHpBar', 480, 66)
    this.label('MonsterHpBar', 480, 250)
    this.label('SkillBarHud', 90, 436)
    this.hint()

    this.hud = new RoleInfoHud(this, 16, 14)
    this.boss = new BossHpBar(this, 480, 44)
    this.boss.update({ name: '巫鹰王', hp: 780, maxHp: 1200 })
    this.mob = new MonsterHpBar(this)

    // Modals full-size, centered, hidden until a hook opens them.
    this.backpack = new BackpackWindow(this, { x: 480, y: 272, iconKeyFor: iconKey, onClose: () => this.backpack.close() })
    this.backpack.setItems(bagItems)

    this.furnace = new FurnacePanel(this, { x: 480, y: 280, iconKeyFor: iconKey, onCraft: () => this.toast.show('炼制成功！获得【赤炎噬血杖】', '#ffd873') })
    this.furnace.setMaterials([bagItems[7].item, bagItems[9].item, bagItems[11].item, bagItems[6].item, bagItems[8].item])
    this.furnace.setResult({ id: 'crafted_equip', name: '赤炎噬血杖', kind: 'equip', rarity: 3 })
    this.furnace.setInfo({ name: '赤炎噬血杖', cost: 120 })

    this.toast = new Toast(this, 480, 160)

    // Skill dock (bottom-left), 5 slots on YUIOL — icons are Online placeholders.
    this.skillbar = new SkillBarHud(this, 20, 470)
    const skills: SkillSlotData[] = [
      { skillId: 'slz', hotkey: 'Y', mpCost: 20, level: 5 },
      { skillId: 'lys', hotkey: 'U', mpCost: 35, level: 3 },
      { skillId: 'hytj', hotkey: 'I', mpCost: 50, level: 4 },
      { skillId: 'lyfb', hotkey: 'O', mpCost: 45, level: 2 },
      { skillId: 'jdy', hotkey: 'L', mpCost: 60, level: 1, disabled: true },
    ]
    this.skillbar.setSlots(skills)

    this.result = new ResultBanner(this, {
      onRetry: () => this.result.hide(),
      onContinue: () => this.result.hide(),
    })

    this.exposeHooks()
  }

  private label(text: string, x: number, y: number): void {
    this.add.text(x, y, text, { fontSize: '13px', color: '#8fd0ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(150)
  }

  private hint(): void {
    this.add
      .text(480, 522, '组件预览：血条实时波动 · 背包 hover 出品质色 tooltip · 炼制面板真素材 · Toast/飘字', {
        fontSize: '12px',
        color: '#9fb0c8',
      })
      .setOrigin(0.5)
      .setDepth(300)
  }

  update(_time: number, delta: number): void {
    this.t += delta / 1000
    const osc = (base: number, amp: number, sp: number, ph = 0): number => base + amp * Math.sin(this.t * sp + ph)
    this.hud.update({
      level: 7,
      hp: osc(230, 130, 0.9),
      maxHp: 380,
      mp: osc(110, 70, 1.3, 1),
      maxMp: 190,
      exp: osc(320, 260, 0.5, 2),
      expToNext: 625,
      atk: 45,
      weaponName: '金箍棒',
    })
    this.boss.update({ name: '巫鹰王', hp: osc(680, 480, 0.55), maxHp: 1200 })
    // Sweep skill cooldowns (staggered) to show the overlay animating.
    for (let i = 0; i < 4; i++) {
      const phase = (this.t * 0.6 + i * 0.5) % 1
      this.skillbar.setCooldown(i, 1 - phase)
    }
    const modalOpen = this.backpack.isOpen || this.furnace.isOpen || this.result.isOpen
    if (modalOpen) {
      this.mob.setVisible(false)
      return
    }
    this.mob.update(osc(60, 55, 1.1), 120, 480, 285, true)

    this.floatTimer += delta
    if (this.floatTimer > 620) {
      this.floatTimer = 0
      const kinds = ['damage', 'crit', 'heal', 'exp', 'burn'] as const
      const k = kinds[Math.floor(Math.random() * kinds.length)]
      const txt = k === 'heal' ? '+38' : k === 'exp' ? '+80 EXP' : k === 'crit' ? '暴击 156' : k === 'burn' ? '烧 -22' : '-84'
      spawnFloatingText(this, 480 + Math.random() * 40 - 20, 300, txt, k)
      this.comboN = (this.comboN % 9) + 1
      if (this.comboN % 3 === 0) this.toast.combo(this.comboN, 640, 200)
    }
  }

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__preview = {
      openBackpack: () => this.backpack.open(),
      closeBackpack: () => this.backpack.close(),
      openFurnace: () => this.furnace.open(),
      closeFurnace: () => this.furnace.close(),
      toast: (t: string) => this.toast.show(t),
      burst: () => {
        spawnFloatingText(this, 470, 300, '暴击 27998', 'crit')
        spawnFloatingText(this, 560, 330, '5599', 'damage')
        this.toast.combo(9, 640, 210)
      },
      resultSuccess: () => this.result.showSuccess({ stats: ['用时 01:24', '击杀 37', '获得灵魂 x120'] }),
      resultFail: () => this.result.showFail({ stats: ['坚持 00:48', '击杀 12'] }),
      hideResult: () => this.result.hide(),
      ready: true,
    }
  }
}

function iconKey(item: Item): string {
  const k = `icon_${item.id}`
  return k // preview items use ids that match the icon set; fallback handled by BackpackWindow
}
void ICON_FALLBACK_KEY

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: W,
  height: H,
  backgroundColor: '#0b0e1a',
  scene: [PreviewScene],
})
