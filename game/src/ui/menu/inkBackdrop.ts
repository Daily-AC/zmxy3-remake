import Phaser from 'phaser'

// Shared warm-ink backdrop for the shell menus: a dark wood/ink vertical
// gradient with a soft top glow and a faint scroll of translucent brush bands,
// so the login / slot / character scenes read as one 水墨 family without any
// bespoke background art. Cheap: two gradient rects + a handful of soft lines.

const W = 960
const H = 540

export function drawInkBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(-100)
  // Warm near-black wood gradient, lighter at the top.
  g.fillGradientStyle(0x24190f, 0x24190f, 0x0d0a06, 0x0d0a06, 1)
  g.fillRect(0, 0, W, H)
  // Soft amber glow behind where the title/portraits sit.
  g.fillStyle(0x5a3c1a, 0.28)
  g.fillEllipse(W / 2, H * 0.36, W * 0.9, H * 0.7)
  g.fillStyle(0x2c1d0e, 0.35)
  g.fillEllipse(W / 2, H + 40, W * 1.2, H * 0.7)
  // A few translucent horizontal brush bands for texture.
  g.fillStyle(0x000000, 0.12)
  for (const y of [64, 150, 372, 470]) {
    g.fillRect(0, y, W, 3)
  }
  // Gold hairline frame just inside the canvas edge.
  g.lineStyle(2, 0xd9b45a, 0.35)
  g.strokeRoundedRect(10, 10, W - 20, H - 20, 14)
  return g
}
