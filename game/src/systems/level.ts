// Phaser-independent level/wave/boss/clear flow, ported from kagami's
// LevelSystem.ts (scratchpad/zmxy-eval/kagami-phaser/src/systems/LevelSystem.ts).
//
// Ported (core state machine, kept faithful):
//  - Stop-point wave gating: a wave spawns once, then the stop point only
//    clears once its monsters have been seen alive at least once AND are all
//    dead/gone (updateVerticalClimbSpawn's waveSpawned/waveHadActiveMonsters
//    dance, renamed updateLevelSpawn here).
//  - Boss arena: inactive -> active -> cleared, with a transfer door that
//    only opens after the boss is dead and only lets the player through on
//    an explicit interact press inside its bounds (tryClearArena).
//
// Adapted (kagami's game is a vertical climbing tower; ours is currently a
// flat single-screen fight, per BattleScene.ts's MIN_X/MAX_X/GROUND_Y):
//  - DROPPED entirely: camera lerp (updateVerticalClimbCamera) and cloud
//    parallax (updateCloudScrolls) — both exist purely to animate a
//    scrolling vertical-climb camera we don't have yet. Re-port from kagami
//    when the game actually gets a scrolling/climbing world.
//  - Stop-point activation was position-gated in kagami (playerY <= stop.y,
//    so the player could physically skip between stops). We have no
//    scroll/height axis yet, so activation here is purely sequential: the
//    first uncleared stop point in array order is "active". Same wave-clear
//    state machine, different trigger condition.
//  - Boss-zone trigger was also position-gated in kagami (playerY <=
//    bossTriggerY). Here it's "all of this level's stop points are cleared"
//    — matches the flow you described (waves -> boss -> door -> next level)
//    without inventing a position axis we don't have.
//  - getSpawnCount(playerCount) (kagami's single/duo spawn-count knob) is
//    dropped in favor of each wave explicitly listing its roster
//    (WaveSpec.roster) — more explicit for a multi-species roster, and we're
//    single-player only right now anyway. getSpawnPosition is kept (adapted
//    to a flat ground line instead of a vertical offset).
//
// Original (not in kagami's LevelSystem.ts at all):
//  - Multi-species rosters + per-species MonsterStats presets
//    (MONSTER_SPECIES_STATS): only Monster30 has a reverse-engineered stat
//    block (monsterSim.ts's MONSTER30_STATS, from monsters-index.md). The
//    other six sprites (Monster2/3/4/5/7/8) only have animation-sheet JSON in
//    data/monsters/ — no stats were ever recovered for them. The numbers
//    below are this port's own tuning, sized loosely off each sprite's frame
//    budget (Monster7's cramped 5-row sheet with only one hit combo reads as
//    fast/fragile; Monster5's 350x350 sheet reads as a heavier unit).
//    Monster3 is used as the boss species because kagami's own
//    activateBossArena() instantiates a Monster3Model for the arena boss —
//    that species choice is preserved, only the stat numbers are original.
//  - scaleMonsterStats() + the two-level LEVEL_1/LEVEL_2 data + LevelProgression
//    (multi-level sequencing): kagami's slice only ever needed one level, so
//    none of this existed to port. Built to satisfy "at least 2 levels with
//    a difficulty wall" using scaleMonsterStats's hp/def bump on repeated
//    species (monster30, monster8, monster4, monster2) *and* introducing
//    monster5 as a new heavier species in level 2, so the wall is both
//    "same monster hits harder" and "new tougher monster type".

import type { MonsterStats, MonsterConfig, MonsterState } from './monsterSim'
import { MONSTER30_STATS, initMonster } from './monsterSim'

export type MonsterSpeciesId =
  | 'monster2'
  | 'monster3'
  | 'monster4'
  | 'monster5'
  | 'monster7'
  | 'monster8'
  | 'monster30'

/**
 * Per-species stat presets. Only `monster30` is a recovered value
 * (monsterSim.ts's MONSTER30_STATS); the rest are this port's own tuning —
 * see file header. `monster3` is reserved as the boss species, matching
 * kagami's own choice.
 */
export const MONSTER_SPECIES_STATS: Record<MonsterSpeciesId, MonsterStats> = {
  monster30: MONSTER30_STATS,
  monster2: { hp: 90, speed: 6, attackRange: 200, alertRange: 900, normalAttackRate: 0.4, def: 2 },
  monster4: { hp: 130, speed: 6, attackRange: 220, alertRange: 950, normalAttackRate: 0.45, def: 3 },
  monster7: { hp: 80, speed: 8, attackRange: 190, alertRange: 900, normalAttackRate: 0.5, def: 1 },
  monster8: { hp: 110, speed: 7, attackRange: 210, alertRange: 900, normalAttackRate: 0.45, def: 2 },
  monster5: { hp: 220, speed: 5, attackRange: 240, alertRange: 950, normalAttackRate: 0.5, def: 6 },
  monster3: { hp: 400, speed: 6, attackRange: 260, alertRange: 1000, normalAttackRate: 0.55, def: 8 },
}

/** Scales a species' base stats up for a difficulty wall (hp multiplied,
 * def added flat). Used to make the *same* monster hit harder in a later
 * level without inventing a new species every time. */
export function scaleMonsterStats(base: MonsterStats, hpMultiplier: number, defBonus: number): MonsterStats {
  return {
    ...base,
    hp: Math.round(base.hp * hpMultiplier),
    def: base.def + defBonus,
  }
}

export interface MonsterSpawnSpec {
  species: MonsterSpeciesId
  stats: MonsterStats
}

function spawn(species: MonsterSpeciesId): MonsterSpawnSpec {
  return { species, stats: MONSTER_SPECIES_STATS[species] }
}

function spawnScaled(species: MonsterSpeciesId, hpMultiplier: number, defBonus: number): MonsterSpawnSpec {
  return { species, stats: scaleMonsterStats(MONSTER_SPECIES_STATS[species], hpMultiplier, defBonus) }
}

export interface WaveSpec {
  /** One entry per monster to spawn for this wave; array length = wave size. */
  roster: MonsterSpawnSpec[]
}

export interface BossSpec {
  species: MonsterSpeciesId
  stats: MonsterStats
  /** Display label for the boss HP bar (e.g. distinguishing a harder repeat). */
  label: string
}

export interface TransferDoor {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export interface LevelDef {
  id: string
  name: string
  spawnIntervalMs: number
  stopPoints: WaveSpec[]
  boss: BossSpec
  door: Omit<TransferDoor, 'visible'>
  arenaBounds: { left: number; right: number; top: number; bottom: number }
}

export interface StopPointRuntime {
  wave: WaveSpec
  cleared: boolean
  waveSpawned: boolean
  waveHadActiveMonsters: boolean
}

export type BossArenaState = 'inactive' | 'active' | 'cleared'

export interface BossArenaModel {
  state: BossArenaState
  boss?: MonsterState
  door: TransferDoor
}

export interface LevelState {
  def: LevelDef
  stopPoints: StopPointRuntime[]
  /** Index of the stop point currently spawning/awaiting-clear, or -1. */
  activeStopIndex: number
  bossTriggered: boolean
  arena: BossArenaModel
}

export function createLevelState(def: LevelDef): LevelState {
  return {
    def,
    stopPoints: def.stopPoints.map((wave) => ({
      wave,
      cleared: false,
      waveSpawned: false,
      waveHadActiveMonsters: false,
    })),
    activeStopIndex: -1,
    bossTriggered: false,
    arena: {
      state: 'inactive',
      door: { ...def.door, visible: false },
    },
  }
}

function findNextStopIndex(stopPoints: StopPointRuntime[]): number {
  return stopPoints.findIndex((sp) => !sp.cleared)
}

/**
 * Per-frame wave upkeep, ported from updateVerticalClimbSpawn. Returns true
 * exactly on the tick a new wave should be spawned (caller reads
 * `getActiveWaveRoster(state)` to know which species/how many, and spawns
 * them via monsterSim.initMonster). `activeMonsterCount` is how many
 * monsters from the *current* wave are still alive — the caller tracks this
 * (this module holds no monster instances itself, besides the boss).
 *
 * Note: kagami's version also took a `deltaMs` to pace *roaming* spawns while
 * no stop point was active (a vertical-climb-only case — the player between
 * stops with no wave gate). Our fully sequential design has no such gap
 * (every position is either "some stop uncleared" or "all cleared, boss
 * phase"), so that timer never fires here and the parameter is dropped;
 * `LevelDef.spawnIntervalMs` is kept as level data for whenever within-wave
 * trickle pacing is added.
 */
export function updateLevelSpawn(
  state: LevelState,
  activeMonsterCount: number,
  alivePlayerCount: number = 1,
): boolean {
  if (state.bossTriggered || alivePlayerCount === 0) return false

  const idx = findNextStopIndex(state.stopPoints)
  if (idx === -1) {
    state.activeStopIndex = -1
    return false // every stop point is cleared; boss phase is next
  }
  state.activeStopIndex = idx
  const stopPoint = state.stopPoints[idx]

  if (!stopPoint.waveSpawned) {
    stopPoint.waveSpawned = true
    return true
  }

  if (activeMonsterCount > 0) {
    stopPoint.waveHadActiveMonsters = true
    return false
  }

  if (!stopPoint.waveHadActiveMonsters) return false

  stopPoint.cleared = true
  state.activeStopIndex = -1
  return false
}

/** Roster for the stop point currently spawning/in-progress, or `[]` if none. */
export function getActiveWaveRoster(state: LevelState): MonsterSpawnSpec[] {
  if (state.activeStopIndex < 0) return []
  return state.stopPoints[state.activeStopIndex].wave.roster
}

/** A spawn point near the hero, clamped to the level's horizontal bounds.
 * Adapted from kagami's getSpawnPosition (which offset both x and y for a
 * vertical-climb world); we only have a flat ground line, so y is fixed. */
export function getSpawnPosition(
  heroX: number,
  bounds: { minX: number; maxX: number },
  groundY: number,
  random: () => number,
): { x: number; y: number } {
  const offset = (random() - 0.5) * 300
  const x = Math.min(Math.max(heroX + offset, bounds.minX), bounds.maxX)
  return { x, y: groundY }
}

/** True once every stop point in the level is cleared and the boss hasn't
 * already been triggered — the signal to spawn the boss. */
export function isBossZoneTriggered(state: LevelState): boolean {
  if (state.bossTriggered) return false
  return state.stopPoints.every((sp) => sp.cleared)
}

export function markBossTriggered(state: LevelState): void {
  state.bossTriggered = true
}

/**
 * Spawns the boss and flips the arena to 'active'. `bossConfig` supplies the
 * animation/timing fields (hurtDurationMs etc — the scene's job, same as any
 * other monsterSim MonsterConfig); its `stats` field is overridden with this
 * level's `boss.stats` so a caller can't accidentally spawn the wrong
 * difficulty tier.
 */
export function activateBossArena(
  state: LevelState,
  bossConfig: MonsterConfig,
  x: number,
  y: number,
): MonsterState {
  state.arena.state = 'active'
  const boss = initMonster({ ...bossConfig, stats: state.def.boss.stats }, x, y)
  state.arena.boss = boss
  return boss
}

/** Mirrors monsterSim's own terminal states: 'dead' (hp hit 0) already means
 * defeated for our purposes; 'gone' is post-death-animation removal. */
export function isBossDead(boss: MonsterState): boolean {
  return boss.mode === 'dead' || boss.mode === 'gone'
}

export function revealTransferDoor(state: LevelState): void {
  state.arena.door.visible = true
}

/**
 * Ported from tryClearArena: the player must be standing inside the (now
 * visible) door's bounds and press interact. Returns true and flips the
 * arena to 'cleared' the moment that happens; false otherwise (including
 * while the door is still hidden or the arena isn't active).
 */
export function tryClearArena(
  state: LevelState,
  playerX: number,
  playerY: number,
  interactPressed: boolean,
): boolean {
  const arena = state.arena
  if (arena.state !== 'active') return false
  if (!arena.door.visible) return false
  if (!interactPressed) return false

  const inDoorX = playerX >= arena.door.x && playerX <= arena.door.x + arena.door.width
  const inDoorY = playerY >= arena.door.y && playerY <= arena.door.y + arena.door.height
  if (inDoorX && inDoorY) {
    arena.state = 'cleared'
    return true
  }
  return false
}

export function isLevelCleared(state: LevelState): boolean {
  return state.arena.state === 'cleared'
}

// ── Multi-level progression ──

export interface LevelProgression {
  levels: LevelDef[]
  currentIndex: number
  currentState: LevelState
}

export function createLevelProgression(levels: LevelDef[]): LevelProgression {
  return { levels, currentIndex: 0, currentState: createLevelState(levels[0]) }
}

/** Advances to the next level once the current one is cleared. Returns the
 * new LevelState, or null if the current level isn't cleared yet or this was
 * already the last level (campaign complete). */
export function advanceToNextLevel(progression: LevelProgression): LevelState | null {
  if (!isLevelCleared(progression.currentState)) return null
  const nextIndex = progression.currentIndex + 1
  if (nextIndex >= progression.levels.length) return null
  progression.currentIndex = nextIndex
  progression.currentState = createLevelState(progression.levels[nextIndex])
  return progression.currentState
}

export function isCampaignComplete(progression: LevelProgression): boolean {
  return (
    progression.currentIndex === progression.levels.length - 1 &&
    isLevelCleared(progression.currentState)
  )
}

// ── Level data ──
// Door/arena bounds mirror BattleScene.ts's current single-screen world
// constants (MIN_X=90, MAX_X=1460, GROUND_Y=400) as of this port — a
// placeholder until real per-level layout/scrolling exists.
const WORLD_MIN_X = 90
const WORLD_MAX_X = 1460
const WORLD_GROUND_Y = 400

const SHARED_DOOR = { x: WORLD_MAX_X - 100, y: WORLD_GROUND_Y - 140, width: 100, height: 140 }
const SHARED_ARENA_BOUNDS = {
  left: WORLD_MIN_X,
  right: WORLD_MAX_X,
  top: WORLD_GROUND_Y - 360,
  bottom: WORLD_GROUND_Y + 40,
}

export const LEVEL_1: LevelDef = {
  id: 'level-1',
  name: '初入妖山',
  spawnIntervalMs: 6000,
  stopPoints: [
    { roster: [spawn('monster30'), spawn('monster2')] },
    { roster: [spawn('monster4'), spawn('monster7'), spawn('monster8')] },
    { roster: [spawn('monster30'), spawn('monster8'), spawn('monster2')] },
  ],
  boss: { species: 'monster3', stats: MONSTER_SPECIES_STATS.monster3, label: 'Monster3' },
  door: SHARED_DOOR,
  arenaBounds: SHARED_ARENA_BOUNDS,
}

/** Difficulty wall vs LEVEL_1: monster30/monster8/monster4/monster2 all get
 * scaled-up hp/def repeats, *and* monster5 (a species unused in level 1) is
 * introduced as a new heavier unit; the boss is the same species scaled up
 * further, labeled distinctly for the HP bar. */
export const LEVEL_2: LevelDef = {
  id: 'level-2',
  name: '妖山深处',
  spawnIntervalMs: 5000,
  stopPoints: [
    { roster: [spawnScaled('monster30', 1.6, 2), spawnScaled('monster8', 1.6, 2)] },
    { roster: [spawn('monster5'), spawnScaled('monster4', 1.5, 2)] },
    {
      roster: [
        spawn('monster5'),
        spawnScaled('monster30', 1.8, 3),
        spawnScaled('monster2', 1.6, 2),
      ],
    },
  ],
  boss: {
    species: 'monster3',
    stats: scaleMonsterStats(MONSTER_SPECIES_STATS.monster3, 1.8, 4),
    label: 'Monster3 · Elite',
  },
  door: SHARED_DOOR,
  arenaBounds: SHARED_ARENA_BOUNDS,
}

export const LEVELS: LevelDef[] = [LEVEL_1, LEVEL_2]
