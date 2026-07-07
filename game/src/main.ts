import Phaser from 'phaser'

// ROLE1_0 时装表：1200×2800，6 列 × 14 行，200×200/格。
// 动作 → (起始列, 行, 帧数) 映射来自主逻辑 SWF export.hero.Role1.setAction()，
// 详见 docs/research/asset-pipeline-notes.md。帧号 = 行*6 + 列。
const SHEET_COLS = 6
const ACTIONS: Record<string, { col: number; row: number; frames: number; frameRate: number; loop: boolean }> = {
  wait: { col: 0, row: 0, frames: 6, frameRate: 6, loop: true },
  walk: { col: 0, row: 2, frames: 4, frameRate: 8, loop: true },
  run: { col: 0, row: 3, frames: 4, frameRate: 12, loop: true },
  hit1: { col: 0, row: 6, frames: 5, frameRate: 14, loop: false },
}

class WukongScene extends Phaser.Scene {
  private wukong!: Phaser.GameObjects.Sprite
  private cursors!: Record<'a' | 'd' | 'j', Phaser.Input.Keyboard.Key>
  private attacking = false

  constructor() {
    super('wukong')
  }

  preload() {
    this.load.spritesheet('role1_0', 'assets/extracted/role1_0.png', {
      frameWidth: 200,
      frameHeight: 200,
    })
  }

  create() {
    for (const [key, a] of Object.entries(ACTIONS)) {
      const start = a.row * SHEET_COLS + a.col
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('role1_0', { start, end: start + a.frames - 1 }),
        frameRate: a.frameRate,
        repeat: a.loop ? -1 : 0,
      })
    }

    this.wukong = this.add.sprite(480, 300, 'role1_0').setScale(1.5)
    this.wukong.play('wait')
    this.wukong.on(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'hit1', () => {
      this.attacking = false
      this.wukong.play('wait')
    })

    const kb = this.input.keyboard!
    this.cursors = {
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      j: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
    }

    this.add
      .text(480, 500, 'A/D 走动　J 普攻（hit1 五段之一）', { fontSize: '18px', color: '#8a93b8' })
      .setOrigin(0.5)

    // 验收工具钩子：让外部（playwright/验收脚本）能确定性驱动场景
    ;(window as unknown as Record<string, unknown>).__scene = this
  }

  update() {
    if (this.attacking) return
    if (Phaser.Input.Keyboard.JustDown(this.cursors.j)) {
      this.attacking = true
      this.wukong.play('hit1')
      return
    }
    const left = this.cursors.a.isDown
    const right = this.cursors.d.isDown
    if (left || right) {
      // 原版素材本体朝向为左，向右走才需要镜像
      this.wukong.setFlipX(right)
      this.wukong.x = Phaser.Math.Clamp(this.wukong.x + (left ? -1 : 1) * 2.5, 100, 860)
      if (this.wukong.anims.currentAnim?.key !== 'walk') this.wukong.play('walk')
    } else if (this.wukong.anims.currentAnim?.key !== 'wait') {
      this.wukong.play('wait')
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#0b0e1a',
  scene: [WukongScene],
})
