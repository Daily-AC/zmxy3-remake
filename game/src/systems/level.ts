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
import type { Wall } from './platformSim'

/**
 * Species ids are open strings: level packs (data/levels/) introduce new
 * original-game species per level (L2: monster6/9/10/15/16/19, …) and carry
 * their own stats, so a closed union can't scale to 16 levels. level.ts
 * treats species as an opaque label and only ever reads the stats it's
 * handed alongside it.
 */
export type MonsterSpeciesId = string

/** Level-1's built-in species, kept as a closed union so the in-file stats
 * table and spawn helpers below stay typo-checked. */
type BuiltinSpeciesId =
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
export const MONSTER_SPECIES_STATS: Record<BuiltinSpeciesId, MonsterStats> = {
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
  /** Recovered MonsterAppearPoint registration coordinate. */
  x?: number
  y?: number
  /** Recovered per-point timing. Runtime queues each concrete spawn independently. */
  delayMs?: number
  intervalMs?: number
  quantity?: number
}

function spawn(species: BuiltinSpeciesId): MonsterSpawnSpec {
  return { species, stats: MONSTER_SPECIES_STATS[species] }
}

function spawnScaled(species: BuiltinSpeciesId, hpMultiplier: number, defBonus: number): MonsterSpawnSpec {
  return { species, stats: scaleMonsterStats(MONSTER_SPECIES_STATS[species], hpMultiplier, defBonus) }
}

export interface WaveSpec {
  /** One entry per monster or recovered MonsterAppearPoint. */
  roster: MonsterSpawnSpec[]
  /** Recovered StopPoint x coordinate. The wave remains dormant until reached. */
  stopX?: number
  /** Recovered StopPoint registration coordinate and source metadata. */
  stopY?: number
  betweenRandL?: number
  isBoss?: boolean
}

/** Expand recovered MonsterAppearPoint quantities into concrete spawn requests. */
export function expandMonsterSpawnRoster(roster: MonsterSpawnSpec[]): MonsterSpawnSpec[] {
  return roster.flatMap((point) =>
    Array.from({ length: Math.max(1, Math.floor(point.quantity ?? 1)) }, (_, index) => ({
      ...point,
      delayMs: (point.delayMs ?? 0) + (index + 1) * (point.intervalMs ?? 0),
      quantity: 1,
    })),
  )
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

export interface ContinuousSpawnerSpec {
  /** StageListener11: 72 frames / 24fps = 3000ms. */
  initialDelayMs: number
  /** StageListener11: frameClips(24) * 6 frames = 6000ms. */
  intervalMs: number
  /** Single-player StageListener11 spawns 2 Monster30 per timer fire. */
  count: number
  roster: MonsterSpawnSpec[]
  /** Hero-relative x offset window. */
  offsetX: { min: number; max: number }
  /** Hero-relative y offset window. Negative values spawn above the hero. */
  offsetY: { min: number; max: number }
  heightTrigger?: {
    thresholdY: number
    boss: BossSpec & { x: number; y: number }
  }
}

export interface ContinuousSpawnerState {
  spec: ContinuousSpawnerSpec
  timeUntilNextMs: number
  heightTriggered: boolean
}

export interface ContinuousSpawnRequest extends MonsterSpawnSpec {
  x: number
  y: number
}

export interface ContinuousSpawnerUpdate {
  spawns: ContinuousSpawnRequest[]
  bossSpawn: (BossSpec & { x: number; y: number }) | null
}

export interface ContinuousSpawnerHero {
  x: number
  y: number
  alive: boolean
}

export type SubStageMode = 'climb' | 'horizontal'

export interface FbEntranceSpec {
  registration: { x: number; y: number }
  collision: { x: number; y: number; width: number; height: number }
  requiredHits: number
  hitCooldownFrames: number
  stayFrames: number
  animationFrames: number
}

export interface SubStageDef {
  id: string
  name: string
  mode: SubStageMode
  bounds: { left: number; right: number; top: number; bottom: number }
  door: Omit<TransferDoor, 'visible'>
  heroStart: { x: number; y: number }
  background: {
    base: string
    foreground?: string
    floor?: string
    floorX?: number
    scrollFactorX?: number
  }
  fallbackWalls: Wall[]
  continuousSpawner?: ContinuousSpawnerSpec
  waveLevel?: LevelDef
  fbEntrance?: FbEntranceSpec
}

export interface SubStageChainDef {
  id: string
  name: string
  subStages: SubStageDef[]
}

export interface SubStageChainState<T extends SubStageChainDef = SubStageChainDef> {
  def: T
  currentIndex: number
  cleared: boolean[]
  doors: TransferDoor[]
  levelCleared: boolean
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

export function createContinuousSpawnerState(spec: ContinuousSpawnerSpec): ContinuousSpawnerState {
  return { spec, timeUntilNextMs: spec.initialDelayMs, heightTriggered: false }
}

function between(range: { min: number; max: number }, random: () => number): number {
  return range.min + (range.max - range.min) * random()
}

export function updateContinuousSpawner(
  state: ContinuousSpawnerState,
  hero: ContinuousSpawnerHero,
  deltaMs: number,
  random: () => number = Math.random,
): ContinuousSpawnerUpdate {
  const spawns: ContinuousSpawnRequest[] = []
  let bossSpawn: ContinuousSpawnerUpdate['bossSpawn'] = null

  const trigger = state.spec.heightTrigger
  if (hero.alive && trigger && !state.heightTriggered && hero.y <= trigger.thresholdY) {
    state.heightTriggered = true
    bossSpawn = { ...trigger.boss }
  }

  if (!hero.alive) return { spawns, bossSpawn }

  state.timeUntilNextMs -= Math.max(0, deltaMs)
  while (state.timeUntilNextMs <= 0) {
    for (let i = 0; i < state.spec.count; i++) {
      const spec = state.spec.roster[i % state.spec.roster.length]
      spawns.push({
        ...spec,
        x: hero.x + between(state.spec.offsetX, random),
        y: hero.y + between(state.spec.offsetY, random),
      })
    }
    state.timeUntilNextMs += state.spec.intervalMs
  }

  return { spawns, bossSpawn }
}

export function createSubStageChainState<T extends SubStageChainDef>(def: T): SubStageChainState<T> {
  return {
    def,
    currentIndex: 0,
    cleared: def.subStages.map(() => false),
    doors: def.subStages.map((stage) => ({ ...stage.door, visible: false })),
    levelCleared: false,
  }
}

export function currentSubStage<T extends SubStageChainDef>(state: SubStageChainState<T>): T['subStages'][number] {
  return state.def.subStages[state.currentIndex]
}

export function currentSubStageDoor(state: SubStageChainState): TransferDoor {
  return state.doors[state.currentIndex]
}

export function markCurrentSubStageCleared(state: SubStageChainState): void {
  state.cleared[state.currentIndex] = true
  state.doors[state.currentIndex].visible = true
}

export function tryAdvanceSubStage(
  state: SubStageChainState,
  playerX: number,
  playerY: number,
  interactPressed: boolean,
): boolean {
  if (state.levelCleared) return false
  if (!interactPressed) return false
  if (!state.cleared[state.currentIndex]) return false
  const door = state.doors[state.currentIndex]
  if (!door.visible) return false
  const inDoorX = playerX >= door.x && playerX <= door.x + door.width
  const inDoorY = playerY >= door.y && playerY <= door.y + door.height
  if (!inDoorX || !inDoorY) return false

  if (state.currentIndex >= state.def.subStages.length - 1) {
    state.levelCleared = true
  } else {
    state.currentIndex += 1
  }
  return true
}

export function isSubStageChainCleared(state: SubStageChainState): boolean {
  return state.levelCleared
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
  playerX: number = Number.POSITIVE_INFINITY,
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
    if (stopPoint.wave.stopX !== undefined && playerX < stopPoint.wave.stopX) return false
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

/** Rightmost x the hero may reach while a horizontal StopPoint remains uncleared. */
export function horizontalProgressMaxX(state: LevelState, levelMaxX: number): number {
  const idx = findNextStopIndex(state.stopPoints)
  if (idx === -1) return levelMaxX
  const stopX = state.stopPoints[idx].wave.stopX
  return stopX === undefined ? levelMaxX : Math.min(levelMaxX, stopX)
}

/** Hero movement remains free inside the frozen StopPoint viewport. The
 * original ViewControllor freezes the scene/camera at the marker, then lets
 * BaseHero move up to the screen edge; stopX is not itself an invisible wall. */
export function horizontalHeroMaxX(
  state: LevelState,
  levelMaxX: number,
  viewportWidth: number,
  rightInset: number,
): number {
  const cameraCenterMaxX = horizontalProgressMaxX(state, levelMaxX)
  return Math.min(levelMaxX, cameraCenterMaxX + viewportWidth / 2 - rightInset)
}

export function areStopPointsCleared(state: LevelState): boolean {
  return state.stopPoints.every((sp) => sp.cleared)
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
