# Procedurally generates game/public/assets/extracted/ui/dialogue_textpanel_crop.png
# (the hud_ink_band texture used by Toast.ts and DialogueBox.ts): a rough
# torn-edge ink brushstroke band with a thin gold rim, no baked photographic
# content. Replaces the old crop off a story-cutscene screenshot, which had a
# spoken line and character-sprite fragments baked into it. See
# tasks/backpack-toast-report.md for why extraction from the vendor SWF
# library wasn't viable (no separable clean ink-band symbol exists).
#
# Usage: python3 tools/gen-ink-band.py
#   -> writes ./hud_ink_band.png next to wherever this is run from; copy that
#      over game/public/assets/extracted/ui/dialogue_textpanel_crop.png.
import numpy as np
from PIL import Image, ImageFilter

rng = np.random.default_rng(7)

W, H = 942, 114
INK = np.array([4, 3, 3])       # near-black, darker than the panel fill so the brush edge reads
RIM = np.array([201, 158, 76])  # HUD_COLORS.gold-ish warm rim catching the "light" on the stroke

def brush_edge_alpha(width, band_h, jag_amp, seed, edge_softness=3):
    """Rough calligraphy-stroke edge: 1D random walk (band-limited noise) gives
    the boundary y-offset per column; alpha is 1 inside the ink, tapering to 0
    across `edge_softness` px at the rough boundary."""
    r = np.random.default_rng(seed)
    # low-frequency random walk, smoothed, for a natural brush wobble
    n = 24
    coarse = r.normal(0, 1, n).cumsum()
    coarse -= coarse.mean()
    coarse = coarse / (np.abs(coarse).max() + 1e-6) * jag_amp
    xs = np.linspace(0, width - 1, n)
    boundary = np.interp(np.arange(width), xs, coarse)
    # add a little high-frequency jitter for texture
    boundary += r.normal(0, jag_amp * 0.12, width)
    alpha_col = np.zeros((band_h, width), dtype=np.float32)
    for x in range(width):
        b = boundary[x]
        for y in range(band_h):
            d = y - b
            a = np.clip(d / edge_softness, 0, 1)
            alpha_col[y, x] = a
    return alpha_col

# Top rule: ink fills the band, rough torn edge at the BOTTOM of this strip
# (so it reads as a brush stroke whose ragged edge faces into the panel).
TOP_H = 34
top_alpha = brush_edge_alpha(W, TOP_H, jag_amp=6, seed=1, edge_softness=4)
top_alpha = 1.0 - top_alpha  # invert: solid near y=0, ragged toward y=TOP_H

# Bottom rule: mirror of top.
BOT_H = 30
bot_alpha = brush_edge_alpha(W, BOT_H, jag_amp=5, seed=2, edge_softness=4)
# solid near the bottom (large y), ragged edge faces up into the panel -> already matches (alpha 0 at y=0 boundary side, 1 deeper)

# Left/right fade so a stretched Image (setDisplaySize) blends into rounded
# panel corners instead of a hard vertical seam.
fade_px = 70
x = np.arange(W)
edge_fade = np.ones(W, dtype=np.float32)
edge_fade[:fade_px] = np.linspace(0, 1, fade_px)
edge_fade[-fade_px:] = np.linspace(1, 0, fade_px)

# subtle texture noise so the fill isn't a flat rectangle (brush-stroke grain)
def grain(shape, seed, scale=0.10):
    r = np.random.default_rng(seed)
    g = r.normal(0, 1, shape)
    im = Image.fromarray(((g - g.min()) / (np.ptp(g) + 1e-6) * 255).astype(np.uint8))
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    g2 = np.asarray(im, dtype=np.float32) / 255.0
    return 1.0 - scale + scale * g2

canvas = np.zeros((H, W, 4), dtype=np.uint8)

def paint(y0, band_alpha, tex_seed, rim_at_row):
    """rim_at_row: index (within the band) where the stroke's inner edge sits,
    used to lay a thin warm highlight one px inside the ink, like light
    catching a dry-brush pass -- the cheap way to make a near-black shape
    read as a *brush stroke* instead of a flat drop shadow."""
    band_h = band_alpha.shape[0]
    tex = grain((band_h, W), tex_seed)
    a = band_alpha * tex * edge_fade[None, :]
    a = np.clip(a, 0, 1)
    rgb = np.tile(INK, (band_h, W, 1)).astype(np.float32)
    rim_band = max(0, rim_at_row - 2)
    rim_alpha = np.clip(1 - np.abs(np.arange(band_h) - rim_at_row)[:, None] / 2.5, 0, 1) * 0.35
    rgb += rim_alpha[..., None] * (RIM - INK)[None, None, :] * edge_fade[None, :, None]
    canvas[y0:y0 + band_h, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    canvas[y0:y0 + band_h, :, 3] = (a * 255).astype(np.uint8)

paint(0, top_alpha, tex_seed=11, rim_at_row=6)
paint(H - BOT_H, bot_alpha, tex_seed=22, rim_at_row=6)

img = Image.fromarray(canvas, mode='RGBA')
img = img.filter(ImageFilter.GaussianBlur(0.6))
out = "hud_ink_band.png"
img.save(out)
print("saved", out, img.size)
