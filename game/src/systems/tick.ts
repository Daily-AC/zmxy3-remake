// Original stage frame rate. Evidence: `Config.frameClips = 30` (kagami
// reverse-engineering pets-index.md:585, cross-checked against drops-index.md
// where `frameClips * 60 ≈ 60s`). One "tick" == one original stage frame.
export const FPS = 30
export const TICK_MS = 1000 / FPS
