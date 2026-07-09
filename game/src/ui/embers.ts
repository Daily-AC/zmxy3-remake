import Phaser from 'phaser'

// Drifting ember motes for the fiery keyart screens (menu/login). Hand-rolled
// with tweens instead of the particle system on purpose: Phaser 4's particle
// pipeline differs from v3 and this needs exactly one visual behavior --
// slow upward drift with flicker -- which 20 tweened arcs deliver with zero
// migration risk (CLAUDE.md: v4 渲染层差异需查证; tweens/graphics are stable API).
export function addEmbers(
  scene: Phaser.Scene,
  opts: { w: number; h: number; count?: number; depth?: number } ,
): Phaser.GameObjects.Group {
  const { w, h } = opts
  const count = opts.count ?? 22
  const group = scene.add.group()
  for (let i = 0; i < count; i++) {
    const r = 1 + Math.random() * 2.2
    const shade = Phaser.Display.Color.GetColor(255, 140 + Math.floor(Math.random() * 90), 40)
    const dot = scene.add.circle(Math.random() * w, h * 0.35 + Math.random() * h * 0.65, r, shade, 0.85)
    dot.setBlendMode(Phaser.BlendModes.ADD)
    if (opts.depth !== undefined) dot.setDepth(opts.depth)
    group.add(dot)
    const drift = (): void => {
      if (!dot.active) return
      dot.setPosition(Math.random() * w, h * 0.55 + Math.random() * h * 0.45)
      dot.setAlpha(0)
      scene.tweens.add({
        targets: dot,
        y: dot.y - (120 + Math.random() * 200),
        x: dot.x + (Math.random() - 0.5) * 60,
        alpha: { from: 0.9, to: 0 },
        duration: 2600 + Math.random() * 2600,
        delay: Math.random() * 1800,
        ease: 'Sine.easeOut',
        onComplete: drift,
      })
    }
    drift()
  }
  return group
}
