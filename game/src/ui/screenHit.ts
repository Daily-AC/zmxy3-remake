// Shared scene-level screen-space hit-testing helper.
//
// Every battle-time UI panel below sits in a `.setScrollFactor(0)` container
// so it stays fixed on screen while BattleScene's camera scrolls (it follows
// the hero continuously via `cameras.main.startFollow`, and scrolls
// vertically during the L1 climb intro too). Phaser's own `setInteractive()`
// hit-tests by converting the pointer to WORLD space via the camera's
// current scroll (`InputManager.hitTest`, `node_modules/phaser/src/input/
// InputManager.js:924`, reads `gameObject.scrollFactorX` -- a property of
// the individual child, not inherited from the parent container) -- so once
// the camera has scrolled even slightly, every `setInteractive()` zone
// drifts out from under its own rendered button while the button itself
// (correctly) stays fixed on screen. First diagnosed and fixed in
// SkillBarHud (4662cd6) after a live user report ("打开背包后所有按钮点不动"),
// re-diagnosed independently in BackpackWindow, then found to be a family
// bug across every other battle-time panel (FurnacePanel, ResultBanner,
// MenuButton in the ResultBanner context, DialogueBox's 炼宝 button) by a
// blue/red-team review pass. All of them use this same helper instead.
//
// Usage: register ONE scene-level `pointerdown`/`pointermove` listener per
// panel (not per button), convert `pointer.x/y` to the panel's local space
// (usually just `pointer.x - container.x`, `pointer.y - container.y`), and
// test against these rects -- never call `.setInteractive()` on a GameObject
// living inside a `scrollFactor(0)` container in a scene whose camera moves.
export type Rect = { x: number; y: number; w: number; h: number }

export function withinRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
