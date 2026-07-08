// Shared depth constants for the handful of layers that are known to
// actually collide in practice -- NOT a full inventory of every setDepth()
// call in the project (that's a separate, larger cleanup). Scope here is
// exactly the collision blue/red-team review flagged: Toast.ts and
// FurnacePanel.ts both hard-coded the identical literal `210`, and
// WorldMapScene.submitCraft() (and BattleScene's own craft validation path)
// routinely shows a Toast while the FurnacePanel it's reporting on is still
// open, with no explicit rule for which one should render on top.
//
// MODAL_PANEL_DEPTH is FurnacePanel's unchanged historical value (still used
// by nothing else, kept as a named constant instead of a bare literal).
// TOAST_DEPTH is deliberately well above every other panel depth in the
// project as of this writing (BackpackWindow/DialogueBox 200, FurnacePanel
// 210, ResultBanner 250, BattleScene's pause menu 300) so a toast is always
// the topmost thing on screen regardless of which panel happens to be open
// underneath it, rather than merely winning against FurnacePanel specifically.
export const MODAL_PANEL_DEPTH = 210
export const TOAST_DEPTH = 310
