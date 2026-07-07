// Pure-data mapping: game event/action name -> which audio asset to play,
// at what volume, whether it loops. No Phaser/Howler dependency here — the
// wiring layer (scenes/) decides how to actually load and play; this module
// only answers "which file, how loud, does it loop." See
// game/public/assets/audio/MANIFEST.md for where each file came from and
// tasks/audio-report.md for the wiring interface this is meant to feed.
//
// Keys are the literal action-name/event strings already used across the
// codebase (systems/heroSkill.ts `actionName`, systems/combo.ts,
// systems/jump.ts, role*.json `actions` keys) — this is the existing system
// vocabulary, not a new one invented for this file.

export interface SoundDef {
  /** File under game/public/assets/audio/, without extension or path. */
  key: string
  volume: number
  loop: boolean
}

/**
 * Hero (Role1/悟空, the only currently-playable role) action-name -> sfx.
 * `null` means no original audio exists for that action — a real content
 * gap, not an oversight; see MANIFEST.md "已知缺口".
 */
export const HERO_ACTION_SOUND: Record<string, SoundDef | null> = {
  // Basic combo. Role1_hit1AndHit2/hit3AndHit4 each cover a pair of combo
  // stages in the original audio (one cue per two swings), so both stages
  // in a pair point at the same file.
  hit1: { key: 'Role1_hit1AndHit2', volume: 0.6, loop: false },
  hit2: { key: 'Role1_hit1AndHit2', volume: 0.6, loop: false },
  hit3: { key: 'Role1_hit3AndHit4', volume: 0.6, loop: false },
  hit4: { key: 'Role1_hit3AndHit4', volume: 0.6, loop: false },
  hit5: { key: 'Role1_hit5', volume: 0.65, loop: false },

  // Skill actionNames (see heroSkill.ts castXxx() functions per skillId).
  hit6: { key: 'Role1_hit6', volume: 0.6, loop: false },
  hit7: { key: 'Role1_hit7', volume: 0.6, loop: false },
  hit8: { key: 'Role1_hit8', volume: 0.6, loop: false },
  hit8_2: { key: 'Role1_hit8', volume: 0.6, loop: false },
  hit9: { key: 'Role1_hit9', volume: 0.6, loop: false },
  hit10_2: { key: 'Role1_hit10_2', volume: 0.65, loop: false },
  hit10_4: { key: 'Role1_hit10_4', volume: 0.65, loop: false },
  hit11_1: { key: 'Role1_hit11', volume: 0.6, loop: false },
  hit11_2: { key: 'Role1_hit11', volume: 0.6, loop: false },
  // hit12/hit12_1 are two distinct actionNames in heroSkill.ts (hyjj's
  // primary hit + its follow-up); the original audio has two hit12 cues
  // (_1/_2), paired here in the order they fire.
  hit12: { key: 'Role1_hit12_1', volume: 0.65, loop: false },
  hit12_1: { key: 'Role1_hit12_2', volume: 0.65, loop: false },
  hit13: { key: 'Role1_hit13_1', volume: 0.65, loop: false },
  hit14: { key: 'Role1_hit14', volume: 0.7, loop: false },

  // State/locomotion.
  hurt: { key: 'Role1_beAttack', volume: 0.55, loop: false },
  dead: { key: 'Role1_dead', volume: 0.7, loop: false },
  jump1: { key: 'Role1_jump', volume: 0.4, loop: false },
  jump2: { key: 'Role1_jump', volume: 0.4, loop: false },

  // No original cue exists for these (verified against the 84-symbol
  // Music.swf export, not just "didn't look") — see MANIFEST.md.
  jump3: null,
  wait: null,
  wait2: null,
  walk: null,
  run: null,
}

/** Cross-cutting game events not tied to a specific hero action. */
export const EVENT_SOUND: Record<string, SoundDef | null> = {
  pickup: { key: 'pickup', volume: 0.7, loop: false },
  // Monster's hurt reaction to a hero hit. Only a Role1 variant is mapped
  // since Role1 is the only playable hero right now (Role2-4 equivalents —
  // BeattackByRole2/3/4 — exist in the audio library for future use).
  monster_hurt: { key: 'BeattackByRole1', volume: 0.6, loop: false },
  bgm_level1: { key: 'bg1', volume: 0.35, loop: true },
  stage_clear: { key: 'Game_Victory', volume: 0.8, loop: false },
  game_over: { key: 'over', volume: 0.8, loop: false },

  // Genuine content gaps: no matching original cue exists in Music.swf.
  // See MANIFEST.md "已知缺口" for why each of these is legitimately empty.
  levelup: null,
  respawn: null,
  ui_click: null,
}

export function resolveHeroActionSound(action: string): SoundDef | null {
  return HERO_ACTION_SOUND[action] ?? null
}

export function resolveEventSound(event: string): SoundDef | null {
  return EVENT_SOUND[event] ?? null
}
