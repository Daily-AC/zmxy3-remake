import Phaser from 'phaser'
import { TICK_MS } from '../systems/tick'
import { FloatingTextLaneAllocator } from '../systems/floatingTextLayout'
import { RoleData, ActionSpec, actionFrameTimings, actionDurationMs } from '../systems/roleData'
import {
  HeroConfig,
  HeroState,
  HeroEdges,
  NO_EDGES,
  advanceHero,
  clearHeroInputForLock,
  initHeroState,
  makeHeroConfig,
} from '../systems/heroSim'
import {
  MonsterConfig,
  type MonsterEvent,
  MonsterState,
  MonsterStats,
  initMonster,
  advanceMonster,
} from '../systems/monsterSim'
import {
  Monster3Spec,
  MonsterSkillGate,
  SkillOverlayState,
  SpawnedHitbox,
  createSkillOverlayState,
  advanceSkillOverlay,
  spawnedHitboxToRect,
} from '../systems/monsterBehaviors'
import { heroAttackBox, centeredBox, overlaps, type Rect } from '../systems/hitbox'
import {
  fallbackMonsterAttackSpec,
  horizontalAttackReach,
  monsterAttackSpecFor,
  resolveAttackSpec,
} from '../systems/attackSpec'
import {
  DropEntity,
  PickupConfig,
  DEFAULT_PICKUP_RADIUS,
  spawnConsumableDrop,
  spawnDrop,
  spawnSoulDrop,
  stepDrops,
} from '../systems/pickup'
import { createInventory, addItem, listStacks, Inventory } from '../systems/inventory'
import { monsterSoulDropAmount, rollDrops, type DropRollContext } from '../systems/dropRoll'
import { l1StarterRewards } from '../systems/starterRewards'
import type { Item } from '../systems/items'
import { collectWorldPickup, rollMedicineDrop, type ConsumableId } from '../systems/consumables'
import {
  Equipment,
  EquipSlot,
  createEquipment,
  equip,
  equipEligibility,
  unequip,
  equippedList,
  isSupportedEquipmentForHero,
  slotForItem,
  weaponShowIdForItem,
} from '../systems/equipment'
import {
  HeroIdentityState,
  createHeroIdentity,
  gainHeroExp,
  damageHero,
  updateHeroIdentity,
  heroTotalAtk,
  heroTotalDef,
  heroMagicDef,
  heroBaseStats,
  syncHeroEquipment,
  heroStats,
  isHeroDead,
  isHeroInvincible,
} from '../systems/heroIdentity'
import { rollDailyLuck } from '../systems/heroGrowth'
import { computeCombatPower } from '../systems/combatPower'
import {
  SoulPurse,
  addSoul,
  createSoulPurse,
  sellCommonEquipment,
  sellEquipmentItem,
} from '../systems/soulPurse'
import {
  AttackKind,
  NormalAttackHit,
  calculateNormalAttackPower,
  resolveIncomingHeroDamage,
} from '../systems/heroScale'
import {
  spawnEnemyProjectile,
  stepEnemyProjectilesAgainstTargets,
  type EnemyProjectile,
  type EnemyProjectileHit,
  type EnemyProjectileTarget,
} from '../systems/enemyProjectiles'
import { RealSkillId, calculateRealSkillDamage } from '../systems/skillDamageReal'
import {
  LevelDef,
  LevelState,
  MonsterSpawnSpec,
  SubStageChainDef,
  SubStageChainState,
  SubStageDef,
  ContinuousSpawnerState,
  areStopPointsCleared,
  createContinuousSpawnerState,
  createLevelState,
  createSubStageChainState,
  currentSubStage,
  currentSubStageDoor,
  horizontalProgressMaxX,
  horizontalHeroMaxX,
  updateLevelSpawn,
  updateContinuousSpawner,
  getActiveWaveRoster,
  isBossZoneTriggered,
  markBossTriggered,
  markCurrentSubStageCleared,
  isBossDead,
  revealTransferDoor,
  tryClearArena,
  tryAdvanceSubStage,
  isSubStageChainCleared,
} from '../systems/level'
import {
  LEVEL_1_WUYING,
  LEVEL_2_TIANGONGDAO,
  LEVEL1_MONSTER_NAMES,
  LEVEL1_MONSTER_STATS,
} from '../data/levels/level1'
import { resolveHorizontalMotion, resolveVerticalMotion, type Wall } from '../systems/platformSim'
import { wallsForLevel1SubStage } from '../systems/level1Geometry'
import { LEVEL2_MONSTER_NAMES, LEVEL2_MONSTER_STATS } from '../data/levels/level2'
import { LEVEL_3_ERLANGSHEN, LEVEL3_MONSTER_NAMES } from '../data/levels/level3'
import { LEVEL_4_XIENIAN, LEVEL4_MONSTER_NAMES } from '../data/levels/level4'
import { monsterExp } from '../data/monsterExp'
import type { HeroHit } from '../systems/heroCombat'
import { rollOnHitProcs } from '../systems/effects'
import {
  MaterialLot,
  AttributeBudget,
  CraftTransaction,
  buildCraftRequest,
  lockMaterials,
  consumeMaterials,
  refundMaterials,
  validateCraftedEquipment,
  computeBudget,
} from '../systems/furnace'
import type { LoadedGameState } from '../systems/save'
import { createGameSave, restoreGameState } from '../systems/save'
import type { SlotId } from '../systems/saveSlots'
import { buildSlotEnvelope, writeSlot, readSlot, heroName, asSlotId } from '../systems/saveSlots'
import { loadBattleSaveSeed } from '../systems/battleSaveSeed'
import {
  readCampaignIndex,
  writeCampaignIndex,
  advanceCampaignFrontier,
  ACTIVE_CAMPAIGN_LENGTH,
} from '../systems/campaignProgress'
import { SCENE, REG } from './shellShared'
import { MpModel, createMp, getRole1MaxMp, setMaxMp, tickMpRegen } from '../systems/mp'
import {
  Role1SkillRuntime,
  Role1SkillId,
  Role1SkillLevels,
  SkillHitbox,
  createRole1SkillRuntime,
  syncRole1SkillLevels,
  tickRole1SkillRuntime,
  tryCastRole1Skill,
  getRole1SkillMpCost,
} from '../systems/heroSkill'
import type { SkillTreeState, BindKey, Role1TreeSkillId } from '../systems/skillTree'
import { BIND_KEYS, createDefaultSkillTreeState, getLearnedLevel } from '../systems/skillTree'
import {
  NpcClient,
  ConnStatus,
  ServerMessage,
  NpcItem,
  CraftedItem,
  CraftEffect,
  resolveNpcServerUrl,
} from '../net/npcClient'
import { getSharedSocialClient, resolveSocialServerBaseUrl, type CoopSession, type SocialRoomConnection } from '../net/socialClient'
import { CoopChannel, createSocialRoomTransport } from '../net/coopChannel'
import {
  applyCoopMessage,
  createCoopSyncState,
  encodeLevelEvent,
  interpolatePosition,
  type CoopInboundMessage,
  type CoopSyncState,
  type HeroHitPayload,
  type HitIntentPayload,
  type MonsterStateSnapshot,
} from '../systems/coopSync'
import {
  resolveCoopHeroHitDamage,
  selectNearestAliveHeroTarget,
  selectRemoteHeroHitTargets,
  type AliveHeroTarget,
} from '../systems/coopHeroDamage'
import { missingHostMonsterSnapshots } from '../systems/coopMonsterRuntime'
import {
  advanceWaveSpawnQueue,
  createWaveSpawnQueue,
  waveMonsterCapacity,
  type PendingWaveSpawn,
} from '../systems/waveSpawnQueue'
import { selectBossHudMonster, type BossHudMonster } from '../systems/bossHud'
import { DialogueBox } from '../ui/DialogueBox'
import {
  HUD_TEXTURES,
  HUD_ICONS,
  WORLD_DROP_ICONS,
  ONLINE_TEXTURES,
  ICON_FALLBACK_KEY,
  FloatKind,
} from '../ui/hud/hudTheme'
import { RoleInfoHud } from '../ui/hud/RoleInfoHud'
import { SkillBarHud, SkillSlotData } from '../ui/hud/SkillBarHud'
import { activeArtFont } from '../systems/artFont'
import {
  ROLE1_EFFECTS,
  role1EffectForAction,
  role1EffectFrameKey,
  role1EffectFrameUrl,
  resolveRole1EffectPlacement,
  type Role1EffectAction,
} from '../data/role1Effects'
import {
  monsterHit1EffectAnimationKey,
  monsterHit1EffectFrameKey,
  monsterHit1EffectFrameUrl,
  monsterHit1EffectPhases,
  monsterHit1VisualForAttackFrame,
  type MonsterHit1EffectPhase,
} from '../data/monsterHit1Effects'
import { PrefabLoader, type PrefabDocument } from '../prefab/PrefabLoader'
import bg12PrefabDoc from '../data/prefab/bg12.prefab.json'
import bg13PrefabDoc from '../data/prefab/bg13.prefab.json'
import { BossHpBar, MonsterHpBar } from '../ui/hud/MonsterHpBar'
import { configureLogicalCamera, logicalPointerPosition } from '../systems/renderScale'
import { BackpackWindow } from '../ui/hud/BackpackWindow'
import { FurnacePanel } from '../ui/hud/FurnacePanel'
import { ResultBanner } from '../ui/hud/ResultBanner'
import { Toast, spawnFloatingText } from '../ui/hud/Toast'
import { rarityCss } from '../ui/hud/rarity'
import roleRaw from '../data/roles/role1.json'

const roleData = roleRaw as unknown as RoleData

// ---- monster species registry (data-driven, all campaign levels) ----
// Action tables (RoleData) for every monster, loaded eagerly by Vite glob so a
// level can spawn any species by id without a static import per monster.
const monsterJsonModules = (
  import.meta as unknown as {
    glob: (p: string, o: { eager: boolean }) => Record<string, { default: RoleData }>
  }
).glob('../data/monsters/*.json', { eager: true })
const MONSTER_DATA: Record<string, RoleData> = {}
for (const [path, mod] of Object.entries(monsterJsonModules)) {
  const m = path.match(/(monster\d+)\.json$/)
  if (m) MONSTER_DATA[m[1]] = mod.default
}
// species id -> the extracted sheet's level dir + file (Capitalized), so the
// preloader can load `assets/extracted/<dir>/<file>.png` for each.
const SPECIES_SHEET: Record<string, { dir: string; file: string }> = {}
for (const [dir, ids] of [
  ['level1', ['2', '3', '4', '5', '7', '8', '30']],
  ['level2', ['6', '9', '10', '15', '16', '19']],
  ['level3', ['1', '11', '12', '13', '14', '20', '21', '22', '23']],
  ['level4', ['31', '32', '33', '34']],
] as [string, string[]][]) {
  for (const n of ids) SPECIES_SHEET['monster' + n] = { dir, file: 'Monster' + n }
}
SPECIES_SHEET.monster30 = { dir: 'level1', file: 'Monster30_clean' }

export function monsterSheetAssetFor(species: string): { dir: string; file: string } | undefined {
  return SPECIES_SHEET[species]
}
// Names for boss HP-bar labels, merged from each level pack.
const MONSTER_NAMES: Record<string, string> = {
  ...LEVEL1_MONSTER_NAMES,
  ...LEVEL2_MONSTER_NAMES,
  ...LEVEL3_MONSTER_NAMES,
  ...LEVEL4_MONSTER_NAMES,
}
const ACTIVE_MONSTER_STATS: Record<string, MonsterStats> = {
  ...LEVEL1_MONSTER_STATS,
  ...LEVEL2_MONSTER_STATS,
}
const MONSTER30_BULLET = {
  kind: 'Monster30Bullet1',
  speedPxPerSecond: 620,
  radius: 58,
  ttlMs: 900,
} as const

// hitstun-triad pen (2026-07-09): real AS3 hit1 attackBackInfoDict.power/
// attackKind for every L1/L2 species (this port's own ffdec decompile of
// export.monster.MonsterN, 打开我开始玩.swf). Replaces the old grunt/miniboss
// heuristic ("derive a modest value from def", BattleScene.ts's own comment
// admitted this was a placeholder) that made every non-final-boss hit
// noticeably weaker than intended -- see tasks/hitstun-triad-report.md for
// the full table + decompile citations. Grunts/minibosses/kings all set
// `attackBackInfoDict["hit1"]` UNCONDITIONALLY in their constructors (only hp
// differs across the `gc.curStage==3&&curLevel==3||curStage==8` elite-stage
// branch some of them have), so one value per species covers L1/L2 correctly
// regardless of branch. Monster9/10/19 are branch-conditional (`curStage==9`
// elite form is 600/physics, far above L1/L2 scope) -- the else-branch value
// below is the one level1.ts/level2.ts's own MonsterStats already use.
const MONSTER_HIT1_POWER: Record<string, { power: number; kind: AttackKind }> = {
  // L1
  monster30: { power: 5, kind: 'physics' }, // 攀爬段蜂群
  monster8: { power: 8, kind: 'physics' }, // 杂兵
  monster7: { power: 14, kind: 'physics' }, // 杂兵 (matches monsterBehaviors.ts's Monster7Spec)
  monster3: { power: 14, kind: 'physics' }, // 巫鹰 (L1 boss)
  monster2: { power: 28, kind: 'physics' }, // 顺风耳 (miniboss)
  monster5: { power: 40, kind: 'physics' }, // 巨灵神 (miniboss)
  monster4: { power: 50, kind: 'physics' }, // 千里眼 (miniboss)
  // L2
  monster10: { power: 30, kind: 'physics' }, // 杂兵 (else-branch)
  monster9: { power: 40, kind: 'physics' }, // 杂兵 (else-branch)
  monster19: { power: 50, kind: 'physics' }, // 杂兵 (else-branch)
  monster6: { power: 100, kind: 'physics' }, // 增长天王 (king)
  monster16: { power: 129, kind: 'physics' }, // 广目天王 (king)
  monster15: { power: 186, kind: 'physics' }, // 多闻天王 (L2 boss)
  // L3/L4 (out of active scope, kept for code that might still reach them)
  monster22: { power: 345, kind: 'physics' }, // 二郎神 hit1 (post-buff)
  monster34: { power: 829, kind: 'physics' }, // 邪·悟空 hit1
}

// l1-truth pen (2026-07-09): AS3 marks these `isBoss=true` in their own
// constructors (tasks/l1-truth-report.md, decompile-confirmed) -- 千里眼/
// 顺风耳/巨灵神 in L1, 增长天王/广目天王 in L2, each its own solo
// stop-point wave in level1.ts/level2.ts, one tier below the level's arena
// boss (巫鹰/多闻天王). This project's own spawnActiveWave() has always
// spawned them with isBoss=false (see activeMiniBoss's doc comment for why
// that can't just be flipped), so they got a plain grunt's head HP bar and
// no entrance fanfare -- likely why a level with 4 real AS3 bosses reads as
// "just one boss" to a player. MONSTER_NAMES already has display labels for
// all five (LEVEL1/2_MONSTER_NAMES).
const MINIBOSS_SPECIES = new Set(['monster2', 'monster4', 'monster5', 'monster6', 'monster16'])

// behavior-wiring pen (2026-07-09): real recovered AS3 "skill" gates from
// systems/monsterBehaviors.ts, layered on top of the boss's own monsterSim
// state machine as an overlay (see monsterBehaviors.ts's "Skill overlay"
// section header for why -- MonsterState/MonsterBehaviorState aren't
// structurally compatible, and isBossDead/the HP bar/several __shell hooks
// already depend on the boss staying a MonsterEntity/MonsterState). Extend
// this map if a future L1/L2 boss's spec defines its own `skill`.
const MONSTER_SKILL_GATES: Record<string, MonsterSkillGate> = {
  monster3: Monster3Spec.skill!, // 巫鹰 hit2 (real AS3 magic nova, see report)
}

// Hero hurtbox for enemy attacks. Size matches the hero's own melee attack box
// height (hitbox.ts's DEFAULT_ATTACK_BOX) and a plausible hero silhouette
// width -- project-chosen, not from AS3 (which resolves hits with per-pixel
// HitTest, see hitbox.ts's own header note).
const HERO_HURTBOX_W = 90
const HERO_HURTBOX_H = 150

const HERO_TEX = 'role1_0'
export const BATTLE_READY_EVENT = 'battle-ready'
const COMBO_BANNER_TEX = 'combo_banner_generated'
// Weapon overlays share the body's 200x200 frame grid and registration point.
// The original client selects ROLE1_EQUIP_<MyEquipObj.showid>; only the two
// Wukong weapons reachable in the MVP are preloaded here.
const MVP_WEAPON_SHOW_IDS = [1, 2] as const
const HERO_ID = 1 as const // 悟空 = kagami hero curve #1 (progression.ts)
const HERO_START_X = 480
const BURN_TICKS = 4
const BURN_INTERVAL_MS = 260
const FREEZE_MS = 1200
const NPC_TEX = 'laojun'
const BATTLE_NPC_ENABLED = false
const HERO_SCALE = 1.5
const NPC_SCALE = 1.0
// 太上老君 sheet: 1800×2100, 6 cols × 7 rows of 300px (12.swf Monster65 boss).
const NPC_CELL = 300
const NPC_WAIT_FRAMES = 6 // row 0 = idle
const NPC_IDLE_FRAME_MS = 130
const NPC_OFFSET = { x: -10, y: -30 }
// export.mapObject.TransferWind (DefineSprite_1039), 10 loose PNG frames,
// native 109x106 each -- see registerTransferWind()'s header.
const TRANSFERWIND_FRAME_COUNT = 10
const GROUND_Y = 400
// Floor art (floorBgN) is a whole scene; crop off the top rainbow/palace band
// (already drawn by bg11) and anchor the platform + foreground clouds here.
const FLOOR_CROP_TOP = 0.27
const FLOOR_TOP_Y = 356
const MIN_X = 90
const MAX_X = 1460
const WORLD_W = 1560
const VIEWPORT_W = 960
const VIEWPORT_H = 540
const HORIZONTAL_HERO_RIGHT_INSET = 40
const BG11_AS3_X_OFFSET = -20
const BG11_SYMBOL_BOUNDS = { left: -59, top: -2370, right: 1073, bottom: 681 } as const
const LEVEL1_CLOUD_PLATFORM_TOP_Y = -1800
const LEVEL1_CLOUD_PLATFORM_BOTTOM_Y = -300
const LEVEL1_CLIMB_GROUND_STRIP_PX = 32
// 悟空精灵格(200px)下半留白：逻辑站立线(wall.y/GROUND_Y)与视觉脚底差
// ≈84px（frame(0,0) 内容 bbox 底 172/200，offset.y=-15，×HERO_SCALE 1.5）。
// 平台梁/地面梁/掉落物的"可视地面"统一下沉这个量，脚底贴梁顶（2026-07-10
// 用户三提"空间位置"的最终修正）。
const STAND_SINK = 84
const SL11_SCENE_ART_TEX = 'online_sl11_full'
const SL11_SCENE_ART_SCALE = 2371 / 1269
const SL11_SCENE_ART_X = 622.699 - 443 * SL11_SCENE_ART_SCALE
const SL11_SCENE_ART_Y = -1872.45 + STAND_SINK - 271 * SL11_SCENE_ART_SCALE

interface VisualContentBounds {
  top: number
  bottom: number
}

// First idle-frame visible-pixel bounds, measured from the shipped PNG alpha
// channel with alpha >= 16. These are content bounds inside one sheet cell,
// not whole-cell approximations; keep the renderer, hitboxes, HP bars and
// floating numbers in the same visible coordinate space.
const HERO_IDLE_CONTENT: VisualContentBounds = { top: 72, bottom: 172 }
const MONSTER_IDLE_CONTENT: Record<string, VisualContentBounds> = {
  monster2: { top: 40, bottom: 171 },
  monster3: { top: 40, bottom: 146 },
  monster4: { top: 39, bottom: 156 },
  monster5: { top: 159, bottom: 298 },
  monster6: { top: 159, bottom: 335 },
  monster7: { top: 29, bottom: 130 },
  monster8: { top: 29, bottom: 123 },
  monster9: { top: 59, bottom: 170 },
  monster10: { top: 59, bottom: 173 },
  monster15: { top: 120, bottom: 309 },
  monster16: { top: 29, bottom: 240 },
  monster19: { top: 59, bottom: 181 },
  monster30: { top: 33, bottom: 108 },
}

function visibleBottomOffset(cellH: number, offsetY: number, scale: number, contentBottom: number): number {
  return offsetY * scale + (contentBottom - cellH / 2) * scale
}

export function computeVisibleTopY(input: {
  stateY: number
  offsetY: number
  scale: number
  cellH: number
  contentTop: number
  baselineCorrectionY?: number
}): number {
  return input.stateY +
    input.offsetY * input.scale +
    (input.contentTop - input.cellH / 2) * input.scale +
    (input.baselineCorrectionY ?? 0)
}

export function monsterBaselineCorrectionY(species: string): number {
  if (species === 'monster30') return 0
  const bounds = MONSTER_IDLE_CONTENT[species]
  const data = MONSTER_DATA[species]
  if (!bounds || !data) return 0
  const heroBottom = visibleBottomOffset(
    roleData.sheet.cellH,
    roleData.offset.y,
    HERO_SCALE,
    HERO_IDLE_CONTENT.bottom,
  )
  const monsterBottom = visibleBottomOffset(data.sheet.cellH, data.offset.y, HERO_SCALE, bounds.bottom)
  return heroBottom - monsterBottom
}

export function climbBackgroundVisibility(hasPillarTexture: boolean): { pillar: boolean; fallback: boolean } {
  return { pillar: hasPillarTexture, fallback: !hasPillarTexture }
}

export function climbSceneArtPlacement(): { x: number; y: number; scale: number } {
  return { x: SL11_SCENE_ART_X, y: SL11_SCENE_ART_Y, scale: SL11_SCENE_ART_SCALE }
}

export function transferDoorVisualCenter(
  door: { x: number; y: number; width: number; height: number },
  climb: boolean,
): { x: number; y: number } {
  return {
    x: door.x + door.width / 2,
    y: door.y + door.height / 2 + (climb ? STAND_SINK : 0),
  }
}

export function pillarTileFrame(sourceHeight: number): { x: number; y: number; width: number; height: number } {
  const y = sourceHeight > 1050 ? 200 : 0
  return { x: 0, y, width: 864, height: Math.min(850, sourceHeight - y) }
}

export function computeBg11ClimbPlacement(): { x: number; y: number; scrollFactorX: number; scrollFactorY: number } {
  return {
    x: BG11_SYMBOL_BOUNDS.left + BG11_AS3_X_OFFSET,
    y: BG11_SYMBOL_BOUNDS.top,
    scrollFactorX: 1,
    scrollFactorY: 1,
  }
}

export function level1PlatformDebugStyle(wall: Pick<Wall, 'type' | 'y'>): {
  strokeColor: number
  strokeAlpha: number
  fillColor: number
  fillAlpha: number
  adaptedCloudPlaceholder: boolean
} {
  const adaptedCloudPlaceholder =
    wall.type !== 'solid' && wall.y >= LEVEL1_CLOUD_PLATFORM_TOP_Y && wall.y <= LEVEL1_CLOUD_PLATFORM_BOTTOM_Y
  return {
    strokeColor: wall.type === 'solid' ? 0xffc45a : 0xbfd7ff,
    strokeAlpha: wall.type === 'solid' ? 0.95 : 0.82,
    fillColor: 0xd8ecff,
    fillAlpha: adaptedCloudPlaceholder ? 0.12 : 0,
    adaptedCloudPlaceholder,
  }
}

export function computeLevel1ClimbCameraBounds(stageBounds = { left: 0, right: 1132, top: -2150, bottom: 430 }): {
  left: number
  right: number
  top: number
  bottom: number
} {
  const heroBottom = GROUND_Y + roleData.offset.y * HERO_SCALE + (roleData.sheet.cellH / 2) * HERO_SCALE
  return {
    ...stageBounds,
    bottom: Math.max(stageBounds.bottom, heroBottom + LEVEL1_CLIMB_GROUND_STRIP_PX),
  }
}

export function dropItemVisualSpec(rarity: number): {
  iconMaxSize: number
  labelY: number
  backgroundAlpha: number
  rarityRing: boolean
  nearbyFrame: boolean
  nameColor: string
} {
  return {
    iconMaxSize: 44,
    labelY: 26,
    backgroundAlpha: 0,
    rarityRing: false,
    nearbyFrame: false,
    nameColor: rarityCss(rarity),
  }
}

// --- Level 1 ground segment (session5 battle-fidelity, tasks/battle-fidelity-brief.md) ---
// The team-lead's diagnosis against docs/reference/user-flow-refs/battle-original.png
// (#1 "背景构图不对") was that the distant palace read too big/close. bg11
// (the climb backdrop) can't simply be scaled down for ground mode: it's
// only 1132px wide, which barely covers the 960-viewport + 72px scroll
// range (WORLD_W - viewport) at scale 1 already -- shrinking it would leave
// bare edges. floorBg1 instead already bakes a SMALL, COMPLETE
// palace+rainbow+staircase+platform composition of its own (the palace
// occupies only its own top ~23% at native res, vs. needing ~700px of
// bg11's 3051px-tall art to show the same content) -- it was clearly
// composed by the original artists as the ground-level establishing shot,
// while bg11 is the taller art built for the vertical climb. So ground mode
// swaps bgBase's texture from bg11 to floorBg1 instead of rescaling bg11;
// bg11 itself is untouched during the climb (same texture/scale/scrollFactor
// as before this task -- "bg11 攀爬段实装不动").
const GROUND_BG_SCALE = 1.3
// team-lead's first-pass review (2026-07-08) found the palace read as "几乎
// 不可见". Root cause (see the setTexture(base, '__BASE') calls below): bgBase
// was silently rendering floorBg1's bottom 504px crop (a stale named frame
// `floorBg1__ground` left on the shared Texture by placeFloor()/floorImg,
// which starts at native y=186 -- already past the palace roofline), not the
// full 690px image -- so the roof genuinely never entered the visible frame,
// no amount of repositioning within that crop could have shown it. With the
// full image restored, the palace (native y0-120, centred at x~700 of 1440)
// still needs repositioning to land on-screen: GROUND_BG_Y gives it headroom
// from the canvas top, GROUND_BG_X recentres it (x=700 at GROUND_BG_SCALE
// would otherwise land past the 960-wide canvas's right edge).
const GROUND_BG_Y = 20
const GROUND_BG_X = -260
// bg12 (莲池华表 -- lotus pond + a large dragon-head swirl-carved railing,
// tools/prefab-compiler output formalized to game/src/data/prefab/bg12.prefab.json)
// was previously tiled at native pixel scale (1:1): its own dragon-rail
// silhouette measures ~436px tall in the 596px-tall source, i.e. it filled
// almost the whole 540px canvas height unscaled -- exactly the "过大过近"
// bridge/railing team-lead flagged. GROUND_BG12_SCALE shrinks it to read as
// a mid-ground structure instead of a close-up wall.
const GROUND_BG12_SCALE = 0.68
const GROUND_BG12_Y = 125
// bg13 (南天门牌坊长廊, the boss-前场 sub-stage per StageListener13.as/
// prefab-compiler-report.md §5.1) narratively comes AFTER bg12's fbEnter
// gate puzzle. It used to tile at (0,0) so its gate row filled the whole
// opening frame from the very first tick -- moving it further along the
// world (GROUND_BG13_X) means it only enters view once the player has
// walked toward the arena's far side, instead of dominating the level's
// opening screenshot (which is what battle-original.png actually captures).
const GROUND_BG13_SCALE = 0.6
const GROUND_BG13_X = 900
const GROUND_BG13_Y = 90
// Near ground band: the REAL carved-stone corridor floor (online_floor12.png,
// 4700x95, recovered from the Online client's stageInfo package -- see
// placeL1GroundBand's header comment for the full extraction story). Native
// height 95px; L1_GROUND_BAND_SCALE blows it up to a legible walkway width,
// positioned so its top edge sits right at the hero's GROUND_Y (400).
const L1_GROUND_BAND_SCALE = 1.3
const L1_GROUND_BAND_Y = GROUND_Y - 5

const HERO_LOOP = new Set(['wait', 'wait2', 'walk', 'run'])
const MON_LOOP = new Set(['wait', 'walk'])
const NPC_ANIM_PREFIX = 'npc_'
// hitstun-triad pen: was a placeholder 220ms ("chosen feel value, TODO-verify"
// per combo.ts's own prior header) -- real AS3 value decompiled from
// export.hero.Role1.normalHit(): `curtime - lasttime > 25*60` resets the
// combo (i.e. hitNum -> 1), so a repeat press within 1500ms of the last hit
// continues the chain. See combo.ts's header for the fuller writeup (also
// fixes the actual infinite-hitstun root cause: presses mid-swing no longer
// buffer/auto-chain, matching Role1.as's real input-rejection behavior).
const COMBO_GRACE_MS = 1500
// combo.stage (1-5) -> the normal-attack hit key whose real coefficient drives
// damage (heroScale.NORMAL_ATTACK_COEFFICIENT). Index 0 is unused (stage 0 = idle).
const COMBO_STAGE_HIT: (NormalAttackHit | null)[] = [null, 'hit1', 'hit2', 'hit3', 'hit4', 'hit5']

export function role1AttackEffectForSwing(
  previousAttackId: number,
  currentAttackId: number,
  comboStage: number,
): Role1EffectAction | null {
  if (currentAttackId === previousAttackId) return null
  if (comboStage === 0) return 'hit3' // official Wukong air attack uses hit3/Role1Bullet3
  const action = COMBO_STAGE_HIT[comboStage]
  if (!action) return null
  return action === 'hit2' ? 'hit1' : action
}
const MON_START_X = 900
// Monster hit-test box baseline (see monsterHitbox()) -- 120x140 is the
// project-chosen AABB size this project has used for a "hero-sized" monster
// since the milestone-2 slice; HITBOX_REFERENCE_CELL (hero's own 200x200
// cell) is what that baseline is calibrated against, so a species with a
// bigger/smaller cell than hero's gets a proportionally bigger/smaller box.
const MONSTER_HITBOX_BASE_W = 120
const MONSTER_HITBOX_BASE_H = 140
const HITBOX_REFERENCE_CELL = 200
// hitstun-triad pen (2026-07-09): REMOVED a stale +30 uniform fudge that used
// to live here ("monster cell is shorter; nudge feet to the floor" -- git
// blame: predates the real per-species `offset.x/y` extraction, back when
// every monster was still a placeholder box). Once the asset pipeline started
// carrying real AS3 `bbdc.setOffsetXY()` values per species (monster-behavior/
// level-pipeline era), this flat +30 became a second, uncoordinated correction
// stacked on top of the now-correct one -- and it was applied to every
// monster's render position but NEVER to the hero's own (`applyHeroRender` has
// no such term), so hero and monster feet were guaranteed to sit ~30px apart
// regardless of species. See BaseBitmapDataClip.as's `setXYByDirect()`
// (`x=-bmWidth/2∓offsetX; y=-bmHeight/2+offsetY`, i.e. the bitmap's CENTER is
// placed at local (∓offsetX, offsetY) relative to the character's own origin)
// -- Phaser's default center origin + `state + offset*scale` is already the
// faithful translation of that math; no extra constant belongs here. Verified
// by hand: hero's own feet (cellH200, offset.y=-15, scale1.5) sit at
// GROUND_Y + (-15*1.5) + 200/2*1.5 = GROUND_Y+127.5; Monster3 (cellH180,
// offset.y=-5) computes to the exact same GROUND_Y+127.5 once the +30 is gone.
const NPC_ID = 'laojun'
const NPC_NAME = '太上老君'
const NPC_X = 1380
const DIALOGUE_RANGE = 120

// --- skills (Role1 悟空) ---
// heroSkill damage is in kagami's original scale (hundreds–thousands) while this
// slice's monster has 150 hp. Scale it down so skills read against current
// numbers. TODO-verify: temporary — remove once the hero-scale pass unifies the
// damage economy (team-lead directive, 2026-07-07). Source of the mismatch:
// skill-tree-port-report.md 数值出处表 (kagami 口径).
const MP_REGEN_PER_SEC = 2 // gentle passive regen (TODO-verify, see mp.ts header)
// SkillHitbox.actionName -> the real (AS3-accurate) skill damage id
// (skillDamageReal.ts). Sub-variant hitboxes (hit8_2 = lyfb's 2nd projectile,
// hmz's two boxes hit10_2/hit10_4) map to their real skill; hit12_1 is the
// visual-only cast MC (no damage). Replaces the old kagami-scale hack.
const REAL_SKILL_BY_ACTION: Record<string, RealSkillId> = {
  hit6: 'slz', hit7: 'hytj', hit8: 'lyfb', hit8_2: 'lyfb', hit9: 'lys',
  hit10_2: 'hmzLianZhan', hit10_4: 'hmzZaDi', hit11_1: 'jdyStage1', hit11_2: 'jdyStage2',
  hit12: 'hyjj', hit13: 'qsez', hit14: 'zz',
}
// Skill dock hotkeys Y U I O L -- the real 造梦西游 player-1 layout. Source: the
// Online 实机 battle-HUD screenshot (docs/reference/zmxy-online-screens/
// battle-hud.png shows five slots keyed Y U I O L, left to right, after the 无双
// ult icon), User.as's findWhichSkillBtnNoneSet controlPlayer-0 order, and
// kagami SkillUISystem (SkillSlotKeyLabels.p1 / P1_BINDING_ORDER, matching).
// S5 (skilltree-report.md) replaced the fixed 5-skill loadout this constant
// used to hold with `this.skillTreeState.bindings` (systems/skillTree.ts) --
// which of the 9 actives sits on which key is now player-chosen in
// SkillTreeScene and persisted; BIND_KEYS is just the physical key order.
// Skill -> a hero animation that exists in role1.json (the SkillHitbox.actionName
// includes sub-variant labels like 'hit8_2' that aren't standalone hero actions).
const SKILL_ACTION: Record<Role1SkillId, string> = {
  slz: 'hit6', lys: 'hit9', hytj: 'hit7', lyfb: 'hit8', jdy: 'hit11_1',
  qsez: 'hit13', zz: 'hit14', hmz: 'hit10', hyjj: 'hit12',
}

export function boundSkillCastFailure(
  skillId: Role1TreeSkillId | null,
): 'not-learned' | 'passive' | null {
  if (!skillId) return 'not-learned'
  if (skillId === 'sx') return 'passive'
  return null
}

const CONSUMABLE_TEXTURES: Record<ConsumableId, { key: string; url: string }> = {
  smallHp: { key: 'drop_cure_small_hp', url: 'assets/generated/cure-small-hp.png' },
  bigHp: { key: 'drop_cure_big_hp', url: 'assets/generated/cure-big-hp.png' },
  smallMp: { key: 'drop_cure_small_mp', url: 'assets/generated/cure-small-mp.png' },
}

export function consumableTextureKey(id: ConsumableId): string {
  return CONSUMABLE_TEXTURES[id].key
}

// Item kind coming from the NPC brain -> the game's item kind vocabulary.
function npcKindToGameKind(k: NpcItem['kind'] | 'equip'): Item['kind'] {
  if (k === 'equipment' || k === 'equip') return 'equip'
  if (k === 'consumable') return 'consumable'
  return 'material' // material, quest
}

type CraftedGameItem = Item & { effects?: CraftEffect[] }

type CampaignEntry = SubStageChainDef | LevelDef

function isSubStageCampaign(def: CampaignEntry): def is SubStageChainDef {
  return 'subStages' in def
}

/** Active L1/L2 are the separate AS3 sl11 九重天 and sl12 天宫道 levels. */
const CAMPAIGN: CampaignEntry[] = [LEVEL_1_WUYING, LEVEL_2_TIANGONGDAO, LEVEL_3_ERLANGSHEN, LEVEL_4_XIENIAN]

/** One live monster: its sim state + config, its sprite, and the render/combat
 * facts (data table, per-monster elemental status, attack power). */
interface MonsterEntity {
  species: string
  state: MonsterState
  config: MonsterConfig
  sprite: Phaser.GameObjects.Sprite
  data: RoleData
  scale: number
  attackPower: number
  attackKind: AttackKind
  isBoss: boolean
  attackId: number // per-swing dedup for hits this monster deals to the hero
  burn: { ticksLeft: number; nextAtMs: number; power: number } | null
  frozenUntilMs: number
  // Incoming hits (combo / skill / burn), drained one per frame into
  // advanceMonster's single incoming-hit slot — monsterSim dedups by attackId.
  hitQueue: { attackId: number; damage: number }[]
  /** Grunt head HP bar (bosses use the top BossHpBar instead). */
  hpBar?: MonsterHpBar
  // behavior-wiring pen: real AS3 "skill" (e.g. Monster3's hit2), layered on
  // top of this entity's own monsterSim state machine -- see
  // MONSTER_SKILL_GATES / advanceEntity. undefined for every species without
  // one (everything except monster3, currently).
  skillGate?: MonsterSkillGate
  skillOverlay?: SkillOverlayState
}

interface RemoteHeroPuppet {
  sprite: Phaser.GameObjects.Sprite
  /** 王者荣耀式头顶名牌（2026-07-10 用户拍板，参照图37）：名字 + 等级圈 +
   * 蓝色血条，整体一个容器随人头顶移动。 */
  plate: Phaser.GameObjects.Container
  hpFill: Phaser.GameObjects.Graphics
  levelText: Phaser.GameObjects.Text
  lastHpKey: string
}

/**
 * Milestone-3 battle scene: parallax level, a Monster30 the hero combos to
 * death with loot -> inventory, and an LLM-driven NPC (太上老君) the player can
 * walk up to and talk with over WebSocket. All game rules live in the
 * Phaser-independent `systems/` and `net/` modules; this scene renders them.
 */
export class BattleScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Sprite
  private npc!: Phaser.GameObjects.Sprite
  private keys!: Record<'a' | 'd' | 'j' | 'k', Phaser.Input.Keyboard.Key>
  private heroState!: HeroState
  private lastAttackEffectId = 0
  private heroConfig!: HeroConfig
  // Level chain: the wave/boss state machine (level.ts) + the live monsters it
  // has spawned (grunts and, once the boss zone triggers, the boss entity).
  private campaignIndex = 0
  private levelState!: LevelState
  private monsters: MonsterEntity[] = []
  private pendingWaveSpawns: PendingWaveSpawn[] = []
  private level1Chain?: SubStageChainState
  private level1Spawner?: ContinuousSpawnerState
  private currentWalls: Wall[] = []
  private climbActive = false
  private bossEntity: MonsterEntity | null = null
  // l1-truth pen: the currently-active miniboss (千里眼/顺风耳/巨灵神/增长
  // 天王/广目天王, see MINIBOSS_SPECIES) borrows the top BossHpBar while
  // it's alive -- these spawn via spawnActiveWave() with isBoss=false (that
  // flag is overloaded with "exempt from aliveGruntCount()'s wave-clear
  // count", which they must NOT be: flipping isBoss=true would make
  // aliveGruntCount() see 0 grunts the instant it spawns, skipping the wave
  // instead of waiting for it to die). Tracked separately so updateBossHud()
  // can feature it without touching that counting semantics.
  private activeMiniBoss: MonsterEntity | null = null
  private portal?: Phaser.GameObjects.Container
  private floorImg?: Phaser.GameObjects.Image
  private bgBase?: Phaser.GameObjects.Image
  private levelBanner?: Phaser.GameObjects.Text
  // Parallax: tilesprites that scroll via tilePositionX. The far base backdrop
  // (bg11) and ground are covering Images (auto-parallax via scrollFactor).
  private bgTiles: { img: Phaser.GameObjects.TileSprite; factor: number }[] = []
  // L1-only prefab-built ground layers (bg12 莲池华表 / bg13 南天门长廊, see the
  // GROUND_BG1{2,3}_* constants above). Built once in buildBackground(),
  // shown/hidden per level/substage. bgTiles above stays the renderer for
  // L2-L4's bgN2/bgN3.
  private bg12Layer?: Phaser.GameObjects.Container
  private bg13Layer?: Phaser.GameObjects.Container
  // L1 爬塔段的云台/漂云可视层（bg11 自身裁切的羽化云素材）。平台碰撞体一直
  // 只有 debug 线框可视（rebuildPlatformDebugOverlay 默认隐藏），正常游玩里
  // 玩家看到的是"踩空气"——2026-07-09 用户打磨反馈后补上正式可视层。
  private climbClouds: Phaser.GameObjects.GameObject[] = []
  private pillarBg?: Phaser.GameObjects.TileSprite
  private climbSceneArt?: Phaser.GameObjects.Image
  private drops: DropEntity[] = []
  private dropSprites = new Map<DropEntity, Phaser.GameObjects.Container>()
  private lastBagFullToastAtMs = -Infinity
  private enemyProjectiles: EnemyProjectile[] = []
  private enemyProjectileSprites = new Map<EnemyProjectile, Phaser.GameObjects.Container>()
  private nextEnemyProjectileId = 1
  private pickupCfg!: PickupConfig
  private inventory: Inventory = createInventory(24)
  // Real battle-HUD components (ui/hud/), replacing the old debug text.
  private roleInfoHud!: RoleInfoHud
  private skillBar!: SkillBarHud
  private backpack!: BackpackWindow
  private furnacePanel!: FurnacePanel
  private resultBanner!: ResultBanner
  // Boss-clear result banner -> portal handoff (auto-continues after a beat).
  private bannerTimer?: Phaser.Time.TimerEvent
  private bossBar!: BossHpBar
  private toastUi!: Toast
  // F1 debug telemetry (hidden by default).
  private debugTexts: Phaser.GameObjects.Text[] = []
  private platformDebugOverlay?: Phaser.GameObjects.Graphics
  private debugVisible = false
  private hud!: Phaser.GameObjects.Text
  private playedHitIds = new Set<number>()
  private readonly floatingTextLanes = new FloatingTextLaneAllocator()
  private bgmStarted = false
  private bgmUnlockQueued = false
  private injected: HeroEdges = { ...NO_EDGES }

  // NPC / dialogue
  private npcClient!: NpcClient
  private npcStatus: ConnStatus = 'closed'
  private npcTag!: Phaser.GameObjects.Text
  private promptText!: Phaser.GameObjects.Text
  private dialogue!: DialogueBox
  private dialogueFresh = true
  // Forge: one in-flight craft at a time. Holds the locked-material transaction,
  // the budget the return is re-validated against, and a timeout that refunds.
  private craftPending: {
    requestId: string
    tx: CraftTransaction
    budget: AttributeBudget
    timer: Phaser.Time.TimerEvent
  } | null = null
  private craftSeq = 0

  // Save-slot wiring (shell -> battle -> shell). activeSlot/origin come from the
  // registry the shell populated; playtimeSec accrues here (only place it can).
  private activeSlot: SlotId | null = null
  private saveOrigin: 'new' | 'continue' = 'new'
  // Which campaign node WorldMapScene's click passed in (init() data); null
  // when BattleScene is entered directly (dev/debug boot with no shell), which
  // falls back to the slot's saved progress like before S1.
  private entryCampaignIndex: number | null = null
  // COOP-SEAM: stored for a future combat-sync pass; solo combat ignores it.
  protected coopSession: CoopSession | null = null
  private coopConnection: SocialRoomConnection | null = null
  private coopChannel: CoopChannel | null = null
  private coopSyncState: CoopSyncState | null = null
  private coopUnsubscribe: (() => void) | null = null
  private coopSeq = 0
  private coopHeroBroadcastAccMs = 0
  private coopMonsterBroadcastAccMs = 0
  private coopMonsterIds = new WeakMap<MonsterEntity, string>()
  private coopMonsterById = new Map<string, MonsterEntity>()
  private coopNextMonsterId = 1
  private coopSentHitIntents = new Set<string>()
  private coopRemoteAttackIds = new Map<string, number>()
  private coopRemoteAttackIdSeq = 300000
  private coopReceivedHeroHitIds = new Set<string>()
  private coopReceivedHeroAttackIdSeq = 600000
  private coopBossDefeatedSent = false
  private remoteHeroes = new Map<string, RemoteHeroPuppet>()
  private playtimeSec = 0
  private playtimeAccMs = 0
  // Esc pause menu (continue / save & quit to main menu).
  private paused = false
  private pauseMenu?: Phaser.GameObjects.Container

  // Skills / MP
  private mp!: MpModel
  private skillRuntime!: Role1SkillRuntime
  // S5: learned skills + Y/U/I/O/L dock bindings (systems/skillTree.ts),
  // player-edited in SkillTreeScene and persisted to the slot -- read fresh
  // from storage in seedFromSave (not the shell registry snapshot, which is
  // only ever set once at CharacterSelect/SlotSelect time and would go stale
  // the moment a skill-tree visit changes it).
  private skillTreeState: SkillTreeState = createDefaultSkillTreeState()
  // While set, the hero holds a skill cast pose instead of heroSim's action.
  private skillAnim: { action: string; untilMs: number } | null = null
  // Monotonic ids for skill/burn hits, kept clear of combo (from 1). Each
  // monster entity has its own hitQueue; these just guarantee unique ids.
  private skillAttackId = 200000
  private skillBarAccMs = 0

  // Equipment / hero combat state
  private equipment: Equipment = createEquipment()
  private weaponSprite!: Phaser.GameObjects.Sprite
  private attachedRole1Effects = new Map<Phaser.GameObjects.Sprite, { action: Role1EffectAction; facing: -1 | 1 }>()
  // Unified hero identity: level/exp (progression) + live hp/death (heroCombat),
  // with equipment layering atk/def on top. Created in create().
  private identity!: HeroIdentityState
  private burnAttackId = 100000 // kept clear of hero attackIds (which start at 1)
  private simClockMs = 0
  // S4 个人资料/背包: 灵魂 wallet (soulPurse.ts; persisted since S5 -- see that
  // file's header) + a once-per-load 幸运 roll (heroGrowth.rollDailyLuck,
  // display-only: not wired into combat math, see combatPower.ts / report).
  private soulPurse: SoulPurse = createSoulPurse()
  private displayLuck = 0

  constructor() {
    super('battle')
  }

  /** WorldMapScene passes which node was clicked; a direct/debug boot into
   * 'battle' (no shell) omits it and falls back to the slot's saved progress. */
  init(data?: { campaignIndex?: number; coopSession?: CoopSession }): void {
    this.entryCampaignIndex = typeof data?.campaignIndex === 'number' ? data.campaignIndex : null
    // COOP-SEAM: accept lobby handoff data without changing battle behavior.
    this.coopSession = data?.coopSession ?? null
  }

  preload(): void {
    this.load.spritesheet(HERO_TEX, 'assets/extracted/role1_0.png', {
      frameWidth: roleData.sheet.cellW,
      frameHeight: roleData.sheet.cellH,
    })
    for (const showId of MVP_WEAPON_SHOW_IDS) {
      this.load.spritesheet(`role1_equip${showId}`, `assets/extracted/role1_equip${showId}.png`, {
        frameWidth: roleData.sheet.cellW,
        frameHeight: roleData.sheet.cellH,
      })
    }
    this.load.spritesheet(NPC_TEX, 'assets/extracted/npc/laojun_sheet.png', {
      frameWidth: NPC_CELL,
      frameHeight: NPC_CELL,
    })
    // Every campaign species' sheet (grid size read from its own action table).
    for (const [species, sheet] of Object.entries(SPECIES_SHEET)) {
      const data = MONSTER_DATA[species]
      if (!data) continue
      this.load.spritesheet(species, `assets/extracted/${sheet.dir}/${sheet.file}.png`, {
        frameWidth: data.sheet.cellW,
        frameHeight: data.sheet.cellH,
      })
    }
    // Backgrounds for every level (L1 bg11/12/13 + L2-L4 bgN1/N2/N3, floors).
    for (const key of ['bg11', 'bg12', 'bg13', 'floorBg1', 'online_sl11_full', 'online_floor12', 'online_floor12_full', 'online_floor13']) {
      this.load.image(key, `assets/extracted/level1/${key}.png`)
    }
    // L2/L3/L4 have NO floorBgN load: floorBg2.png/floorBg3.png/floorBg4.png
    // were confirmed genuinely blank in the source (not an extraction bug) --
    // re-exported chid 3/10/2 directly from vendor's out_res/{2,3,4}.swf with
    // FFDec (`-selectid N -format image:png`, bypassing whatever produced the
    // files already on disk) and got 0 opaque pixels / all-zero RGB every
    // time, confirming the SWF's own DefineBitsLossless2 tag is empty, not a
    // decode failure. Unlike L1 (floorBg1 bakes a real small scene -- palace/
    // platform -- used both directly and as the near ground band's source,
    // see GROUND_BG_* / L1_GROUND_BAND_* above), vendor L2-L4 simply have no
    // dedicated ground-layer art; their bgN1/N2/N3 panoramas are the whole
    // background. (asset-audit-report.md flagged the empty PNGs; L3/L4 are
    // additionally out of campaign scope per CLAUDE.md's L1+L2 cap.)
    for (const n of [2, 3, 4]) {
      const bgCount = n === 4 ? 1 : 3 // L4 only has bg41
      for (let i = 1; i <= bgCount; i++) {
        this.load.image(`bg${n}${i}`, `assets/extracted/level${n}/bg${n}${i}.png`)
      }
    }
    this.load.image('ink_panel', 'assets/extracted/ui/dialogue_textpanel_crop.png')
    // L1 爬塔云台/漂云素材：从 bg11 自身的云海带裁切+椭圆羽化（PIL，
    // tools 见 progress.md 2026-07-09 前端打磨场）——修"平台踩空气/开局一片
    // 米黄"（用户反馈"第一关的图还没贴上来"）。风格零风险：像素就来自 bg11。
    this.load.image('cloud_puff1', 'assets/generated/cloud_puff1.png')
    this.load.image('cloud_puff2', 'assets/generated/cloud_puff2.png')
    // L1 爬塔平台梁：原版是雕花玉石横梁（用户 23:19 参照图），vendor 未提取到
    // 该件——按总纲用生图补（gpt-image-2，喂原版截图当风格参照；青白玉+淡金
    // 云纹浮雕，1743x292 可横向平铺条）。
    this.load.image('platform_beam', 'assets/generated/platform_beam.png')
    // L1 爬塔背景：原版是云纹雕柱塔身（用户参照图），bg11 云海图与之不符——
    // 生图柱墙（同风格锚，上下镜像拼接保证竖向无缝），爬塔段整体替换 bg11。
    this.load.image('pillar_wall', 'assets/generated/pillar_wall.jpg')
    this.load.image(COMBO_BANNER_TEX, 'assets/generated/combo-banner.png')
    for (const { key, url } of Object.values(CONSUMABLE_TEXTURES)) this.load.image(key, url)
    for (const [action, spec] of Object.entries(ROLE1_EFFECTS) as [Role1EffectAction, (typeof ROLE1_EFFECTS)[Role1EffectAction]][]) {
      for (let frame = 1; frame <= spec.frames; frame++) {
        this.load.image(role1EffectFrameKey(action, frame), role1EffectFrameUrl(action, frame))
      }
    }
    for (const phase of monsterHit1EffectPhases()) {
      for (let frame = 1; frame <= phase.shippedFrames; frame++) {
        const url = monsterHit1EffectFrameUrl(phase, frame)
        if (url) this.load.image(monsterHit1EffectFrameKey(phase, frame), url)
      }
    }
    for (let i = 1; i <= TRANSFERWIND_FRAME_COUNT; i++) {
      this.load.image(`transferwind_${i}`, `assets/extracted/effects/transferwind_${i}.png`)
    }
    // Real battle-HUD art: RoleInfo avatar, boss bar, backpack window/cell,
    // item icons, and Online-sourced skill icons.
    for (const { key, url } of [...HUD_TEXTURES, ...HUD_ICONS, ...WORLD_DROP_ICONS, ...ONLINE_TEXTURES]) {
      this.load.image(key, url)
    }
    const audio: Record<string, string> = {
      bgm: 'bg1.mp3',
      hit12: 'Role1_hit1AndHit2.mp3',
      hit34: 'Role1_hit3AndHit4.mp3',
      hit5: 'Role1_hit5.mp3',
      heroJump: 'Role1_jump.mp3',
      monHurt: 'BeattackByRole1.mp3',
      pickup: 'pickup.mp3',
    }
    for (const [key, file] of Object.entries(audio)) {
      this.load.audio(key, `assets/audio/${file}`)
    }
  }

  create(): void {
    this.floatingTextLanes.clear()
    configureLogicalCamera(this)
    this.buildBackground()
    this.registerAnimations(roleData, HERO_TEX, HERO_LOOP, '')
    // Register every campaign species' animations under a per-species prefix.
    for (const species of Object.keys(SPECIES_SHEET)) {
      const data = MONSTER_DATA[species]
      if (data && this.textures.exists(species)) {
        this.registerAnimations(data, species, MON_LOOP, species + '_')
      }
    }
    this.registerNpcIdle()
    this.registerTransferWind()
    this.registerRole1Effects()
    this.registerMonsterHit1Effects()

    this.hero = this.add.sprite(480, GROUND_Y, HERO_TEX).setScale(HERO_SCALE).setDepth(10)
    // Weapon overlay: frame-perfect mirror of the hero, shown only when armed.
    this.weaponSprite = this.add
      .sprite(480, GROUND_Y, 'role1_equip1')
      .setScale(HERO_SCALE)
      .setDepth(11)
      .setVisible(false)
    this.npc = this.add
      .sprite(NPC_X + NPC_OFFSET.x * NPC_SCALE, GROUND_Y + NPC_OFFSET.y * NPC_SCALE, NPC_TEX)
      .setScale(NPC_SCALE)
      .setDepth(9)
      .setVisible(BATTLE_NPC_ENABLED)
    this.npc.play(NPC_ANIM_PREFIX + 'wait')

    this.cameras.main.setBounds(0, 0, WORLD_W, 540)
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1)

    const kb = this.input.keyboard!
    this.keys = {
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      j: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      k: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
    }
    kb.on('keydown-W', () => this.onInteract())
    kb.on('keydown-UP', () => this.onInteract())
    kb.on('keydown-F1', (e: KeyboardEvent) => {
      e.preventDefault()
      this.setDebugVisible(!this.debugVisible)
    })
    // E: equip the first equippable item in the bag. (Unequip is dev-only via the
    // __unequip hook now that U is a skill hotkey; the real unequip is the bag UI.)
    kb.on('keydown-E', () => this.equipFirstFromBag())
    // B: toggle the backpack window.
    kb.on('keydown-B', () => this.toggleBackpack())
    // Y U I O L: cast whatever skill is currently bound to that dock slot
    // (systems/skillTree.ts, player-set in SkillTreeScene; empty/passive
    // slots no-op -- see castBoundSkill).
    for (const key of BIND_KEYS) {
      kb.on('keydown-' + key, () => this.castBoundSkill(key))
    }

    this.heroConfig = makeHeroConfig({
      groundY: GROUND_Y,
      minX: MIN_X,
      maxX: MAX_X,
      comboStageDurationsMs: this.comboStageDurations(),
      comboGraceMs: COMBO_GRACE_MS,
    })
    this.heroState = initHeroState(this.heroConfig, HERO_START_X)
    this.lastAttackEffectId = this.heroState.attackId
    this.seedFromSave()
    this.startLevel(this.campaignIndex)

    this.pickupCfg = {
      gravity: 2,
      groundY: GROUND_Y,
      pickupRadius: DEFAULT_PICKUP_RADIUS,
      tickMs: TICK_MS,
      platformResolver: (q) => resolveVerticalMotion(this.currentWalls, q),
    }

    this.buildHud()
    this.buildDialogue()
    this.buildPauseMenu()
    this.applyHeroRender('wait')
    this.startAudioOnFirstInput()
    this.connectNpc()
    this.exposeDebugHooks()
    this.startCoopSync()

    kb.on('keydown-ESC', () => this.togglePause())
    // A fresh scene (re)entry: no craft in flight, not paused.
    this.craftPending = null
    this.paused = false
    // Scene shutdown (return to main menu): tear down the NPC socket and close
    // the dialogue so nothing (DOM input, reconnect timer) leaks into the shell.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.npcClient?.dispose()
      this.disposeCoopSync()
      this.dialogue?.close()
    })
    this.events.emit(BATTLE_READY_EVENT)
  }

  // ---------- save-slot wiring ----------

  /**
   * Seed hero identity / equipment / inventory from the slot the shell loaded
   * (registry keys set by SlotSelect/CharacterSelect). Falls back to a fresh
   * level-1 悟空 when launched straight into 'battle' with no shell (debug).
   */
  private seedFromSave(): void {
    this.activeSlot = asSlotId(this.registry.get(REG.activeSlot))
    this.saveOrigin = this.registry.get('shell.origin') === 'continue' ? 'continue' : 'new'

    const registryLoaded = this.registry.get('shell.loadedState') as LoadedGameState | undefined
    const seed = loadBattleSaveSeed(window.localStorage, this.activeSlot, registryLoaded, this.saveOrigin)
    if (seed) {
      const loaded = seed.loaded
      this.identity = createHeroIdentity(loaded.progression.heroId, loaded.progression.level)
      // Exact exp (createProgression already set expToNext + clamped for the level).
      this.identity.progression = loaded.progression
      this.equipment = loaded.equipment
      this.inventory = loaded.inventory
      this.skillTreeState = loaded.skillTree
      this.soulPurse = createSoulPurse(loaded.soul)
      this.playtimeSec = seed.playtimeSec
    } else {
      this.identity = createHeroIdentity(HERO_ID)
      this.equipment = createEquipment()
      this.inventory = createInventory(24)
      this.skillTreeState = createDefaultSkillTreeState()
      this.soulPurse = createSoulPurse(0)
      this.playtimeSec = 0
    }
    // Fold the equipped gear's hp/mp affixes into the live pools.
    syncHeroEquipment(this.identity, this.equipment)
    this.displayLuck = rollDailyLuck(this.identity.progression.level)

    // Continue accruing from the slot's stored playtime (lives only in slot meta).
    this.playtimeAccMs = 0

    // MP (full) sized to the hero's level; skill runtime synced to the real
    // learned levels from skillTreeState (S5 -- replaces the old fixed demo
    // loadout). MP isn't persisted (save.ts has no mp field) — it refills on
    // load/level.
    this.mp = createMp(getRole1MaxMp(this.identity.progression.level) + this.identity.equipMaxMpBonus)
    this.skillRuntime = createRole1SkillRuntime()
    syncRole1SkillLevels(this.skillRuntime, this.learnedSkillLevels())

    // Campaign level index: WorldMapScene passes the exact node clicked
    // (entryCampaignIndex); a direct/debug boot with no shell falls back to the
    // slot's saved frontier (readCampaignIndex -- systems/campaignProgress,
    // shared with WorldMapScene so both read/write the identical side-channel
    // key; save.ts itself has no level field, see that file's header).
    this.campaignIndex =
      this.entryCampaignIndex !== null
        ? Math.min(Math.max(0, this.entryCampaignIndex), CAMPAIGN.length - 1)
        : this.activeSlot !== null && this.saveOrigin === 'continue'
          ? readCampaignIndex(window.localStorage, this.activeSlot)
          : 0
  }

  /** Builds the Partial<Role1SkillLevels> heroSkill.ts's syncRole1SkillLevels
   * wants, from skillTreeState's learned entries (S5). `sx` is included even
   * though it's not a `tryCastRole1Skill` id -- heroSkill.ts's own
   * `calculateRole1LifeSteal` reads `runtime.levels.sx` independently. */
  private learnedSkillLevels(): Partial<Role1SkillLevels> {
    const ids: Role1TreeSkillId[] = ['slz', 'lys', 'hytj', 'lyfb', 'jdy', 'qsez', 'zz', 'hmz', 'hyjj', 'sx']
    const levels: Partial<Role1SkillLevels> = {}
    for (const id of ids) {
      const lvl = getLearnedLevel(this.skillTreeState, id)
      if (lvl > 0) (levels as Record<string, number>)[id] = lvl
    }
    return levels
  }

  /** Write the current live state back to the active slot (no-op without a slot). */
  private saveToSlot(): void {
    if (this.activeSlot === null) return
    const save = createGameSave({
      progression: this.identity.progression,
      equipment: this.equipment,
      inventory: this.inventory,
      skillTree: this.skillTreeState,
      soul: this.soulPurse.value,
    })
    writeSlot(window.localStorage, this.activeSlot, buildSlotEnvelope(save, this.playtimeSec))
    writeCampaignIndex(window.localStorage, this.activeSlot, this.campaignIndex)
  }

  private refreshSkillTreeFromSlot(): void {
    if (this.activeSlot === null) return
    const env = readSlot(window.localStorage, this.activeSlot)
    const fresh = env ? restoreGameState(env.save) : undefined
    if (!fresh) return
    this.skillTreeState = fresh.skillTree
    this.soulPurse = createSoulPurse(fresh.soul)
    syncRole1SkillLevels(this.skillRuntime, this.learnedSkillLevels())
    this.refreshSkillBar()
  }

  private openSkillTreeFromBattle(): void {
    if (this.scene.isActive(SCENE.skillTree)) return
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.refreshSkillTreeFromSlot())
    this.scene.launch(SCENE.skillTree, { returnScene: SCENE.battle })
    // main.ts's scene array lists 'skilltree' before 'battle', so Phaser's
    // default render order would paint the (still-visible-while-paused)
    // BattleScene over the freshly launched SkillTreeScene -- the pause
    // would work but the skill tree would be invisible. bringToTop pins the
    // launched scene above battle regardless of boot-config order.
    this.scene.bringToTop(SCENE.skillTree)
    this.scene.pause(SCENE.battle)
  }

  // ---------- pause / return to main menu ----------

  // 2026-07-09 重做（用户："设置页重新做，加一个返回地图的按钮"）：素色矩形
  // → 水墨×暗金双线面板 + 毛笔字标题 + 木纹渐变按钮（MenuButton 同款 DNA，
  // 手绘以便挂进本容器）。按钮点击用场景级 screen-space 命中（pointer.x/y），
  // 不用 setInteractive——镜头滚动后 world-space 命中区会漂（SkillBarHud 同款
  // 教训，2026-07-08 实测）。
  private pauseButtons: { cx: number; cy: number; w: number; h: number; onClick: () => void }[] = []

  private buildPauseMenu(): void {
    const scrim = this.add.rectangle(480, 270, 960, 540, 0x05060c, 0.68).setScrollFactor(0)
    const pw = 400
    const ph = 380
    const px = 480 - pw / 2
    const py = 270 - ph / 2 + 6
    const panel = this.add.graphics().setScrollFactor(0)
    panel.fillStyle(0x14100b, 0.96).fillRoundedRect(px, py, pw, ph, 12)
    panel.lineStyle(3, 0x2c1a0c, 1).strokeRoundedRect(px - 2, py - 2, pw + 4, ph + 4, 14)
    panel.lineStyle(2, 0xd9b45a, 0.9).strokeRoundedRect(px, py, pw, ph, 12)
    panel.lineStyle(1, 0x8a6a30, 0.7).strokeRoundedRect(px + 6, py + 6, pw - 12, ph - 12, 9)
    // 标题下分隔金线 + 中央菱形（大厅同款语汇）。
    const dy = py + 74
    panel.fillGradientStyle(0xd9b45a, 0xd9b45a, 0xd9b45a, 0xd9b45a, 0, 0.85, 0, 0.85)
    panel.fillRect(480 - 140, dy, 134, 1.5)
    panel.fillGradientStyle(0xd9b45a, 0xd9b45a, 0xd9b45a, 0xd9b45a, 0.85, 0, 0.85, 0)
    panel.fillRect(480 + 6, dy, 134, 1.5)
    panel.fillStyle(0xd9b45a, 0.95)
    panel.beginPath()
    panel.moveTo(480, dy - 4)
    panel.lineTo(485, dy + 0.75)
    panel.lineTo(480, dy + 5.5)
    panel.lineTo(475, dy + 0.75)
    panel.closePath()
    panel.fillPath()

    const title = this.add
      .text(480, py + 42, '暂　停', {
        fontSize: '32px',
        fontFamily: activeArtFont().family,
        color: '#ffd873',
        stroke: '#2c1a0c',
        strokeThickness: 4,
        padding: { top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)

    this.pauseButtons = []
    const resume = this.pauseButton(480, py + 118, '继　续', 'primary', () => this.togglePause())
    const toMap = this.pauseButton(480, py + 174, '返回地图', 'ghost', () => this.returnToWorldMap())
    const saveQuit = this.pauseButton(480, py + 230, '保存并回主菜单', 'ghost', () => this.returnToMainMenu())
    // Key-help lives here now (kept off the battlefield).
    const help = this.add
      .text(
        480,
        py + 314,
        'A/D 走　K 跳　J 连击\nYUIOL 技能　B 背包\nW/↑ 对话·传送　E 穿戴',
        { fontSize: '14px', color: '#c8bfa6', align: 'center', lineSpacing: 7 },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
    this.pauseMenu = this.add
      .container(0, 0, [scrim, panel, title, ...resume, ...toMap, ...saveQuit, help])
      .setScrollFactor(0)
      .setDepth(300)
      .setVisible(false)

    const onDown = (pointer: Phaser.Input.Pointer) => {
      if (!this.paused || !this.pauseMenu?.visible) return
      const p = logicalPointerPosition(pointer)
      for (const b of this.pauseButtons) {
        if (Math.abs(p.x - b.cx) <= b.w / 2 && Math.abs(p.y - b.cy) <= b.h / 2) {
          b.onClick()
          return
        }
      }
    }
    this.input.on('pointerdown', onDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.off('pointerdown', onDown))
  }

  /** MenuButton 的木纹渐变皮，手绘进暂停容器（见 buildPauseMenu 头注）。 */
  private pauseButton(
    cx: number,
    cy: number,
    text: string,
    variant: 'primary' | 'ghost',
    onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const w = 300
    const h = 44
    const pal =
      variant === 'primary'
        ? { top: 0xf2c65a, bottom: 0xd98f2e, edge: 0x4a2c12, inner: 0xfbe6a0, text: '#3a2410' }
        : { top: 0x6b4a2c, bottom: 0x4a3016, edge: 0x2c1a0c, inner: 0xd9b45a, text: '#f2eddf' }
    const g = this.add.graphics().setScrollFactor(0)
    g.fillStyle(pal.edge, 1).fillRoundedRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4, 12)
    g.fillGradientStyle(pal.top, pal.top, pal.bottom, pal.bottom, 1)
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10)
    g.lineStyle(1.5, pal.inner, 0.9).strokeRoundedRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6, 8)
    const label = this.add
      .text(cx, cy, text, { fontSize: '18px', color: pal.text, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
    this.pauseButtons.push({ cx, cy, w, h, onClick })
    return [g, label]
  }

  private togglePause(): void {
    // Esc inside the dialogue is handled by the dialogue itself (keyboard is
    // disabled there), so this only fires during normal play.
    if (this.dialogue?.isOpen) return
    this.paused = !this.paused
    this.pauseMenu?.setVisible(this.paused)
  }

  private returnToMainMenu(): void {
    this.saveToSlot()
    this.npcClient?.dispose()
    this.paused = false
    this.pauseMenu?.setVisible(false)
    this.scene.start('mainmenu')
  }

  /** 暂停菜单「返回地图」（2026-07-09 用户要求）：与回主菜单同样先落存档，
   * 落点改为世界地图 hub（赛内屏幕流：登录→选人→地图→关卡）。 */
  private returnToWorldMap(): void {
    this.saveToSlot()
    this.npcClient?.dispose()
    this.paused = false
    this.pauseMenu?.setVisible(false)
    this.scene.start('worldmap')
  }

  // ---------- skills / MP ----------

  /** Keep MP's cap on the hero's level curve; grow current MP by any increase. */
  private syncMpMax(): void {
    const target = getRole1MaxMp(this.identity.progression.level) + this.identity.equipMaxMpBonus
    if (target === this.mp.maxMp) return
    const delta = target - this.mp.maxMp
    setMaxMp(this.mp, target)
    if (delta > 0) this.mp.mp = Math.min(this.mp.maxMp, this.mp.mp + delta)
  }

  /** Y/U/I/O/L keydown entry point: look up the skill currently bound to
   * `key` (systems/skillTree.ts, player-set in SkillTreeScene) and cast it.
   * An empty slot or `sx` (a passive -- no tryCastRole1Skill id, see
   * heroSkill.ts) reports why no cast occurred instead of appearing broken. */
  private castBoundSkill(key: BindKey): void {
    const skillId = this.skillTreeState.bindings[key]
    const failure = boundSkillCastFailure(skillId)
    if (failure) {
      this.showSkillFail(failure)
      return
    }
    this.castSkill(skillId as Role1SkillId)
  }

  private castSkill(skillId: Role1SkillId): void {
    if (this.paused || isHeroDead(this.identity) || this.dialogue?.isOpen) return
    // Combo <-> skill mutual exclusion: don't cast mid-combo, and the shared
    // busy-lock (collectEdges blocks input while cooldownMs > 0) keeps the combo
    // from interrupting a cast.
    if (this.heroState.combo.stage !== 0 || this.heroState.attacking) return

    const ctx = {
      sourcePower: heroTotalAtk(this.identity, this.equipment),
      x: this.heroState.x,
      y: GROUND_Y,
      facingX: this.heroState.facing,
      targets: this.aliveMonsters().map((e) => ({ id: e.species, x: e.state.x, y: GROUND_Y, isAlive: true })),
    }
    const result = tryCastRole1Skill(this.skillRuntime, this.mp, skillId, ctx)
    if (!result.ok) {
      this.showSkillFail(result.reason)
      return
    }
    clearHeroInputForLock(this.heroState)
    // Hold the cast pose for the skill's action duration (shared busy-lock).
    const action = result.reentered && skillId === 'jdy' ? 'hit11_2' : SKILL_ACTION[skillId]
    this.skillAnim = { action, untilMs: this.simClockMs + Math.max(200, this.skillRuntime.cooldownMs) }
    const heroCenter = this.heroVisualCenter()
    const visualBox = result.hitboxes.find((box) => !box.visualOnly) ?? result.hitboxes[0]
    this.spawnRole1Effect(
      action,
      heroCenter.x + this.heroState.facing * (visualBox?.offsetX ?? 40),
      heroCenter.y + (visualBox?.offsetY ?? 0),
      this.heroState.facing,
    )
    this.playSfx(this.hitSfxKey(5), 0.5)
    // Skill level for the real damage formula: jdy stage-2 reuses stage-1's
    // level; others use the runtime's learned level (min 1 since it just cast).
    const skillLevel = Math.max(1, this.skillRuntime.levels[skillId])
    const atk = ctx.sourcePower
    for (const hb of result.hitboxes) this.scheduleSkillHit(hb, skillLevel, atk)
  }

  /** Up/W: dismiss the clear banner (-> portal) first, else use the portal if
   * standing in it, else talk to 老君. */
  private onInteract(): void {
    if (this.resultBanner.isOpen) {
      this.dismissResultBanner()
      return
    }
    if (this.tryUsePortal()) return
    this.tryOpenDialogue()
  }

  private showSkillFail(reason: string): void {
    const msg =
      reason === 'mp' ? '法力不足' :
      reason === 'cooldown' ? '招式未收' :
      reason === 'not-learned' ? '未习得' :
      reason === 'passive' ? '被动技能无需施放' :
      '无目标'
    this.showToast(msg, '#e0b060')
  }

  /**
   * Turn one SkillHitbox descriptor into a real hit: after its activeAfterMs,
   * check overlap with the monster and, if it connects, apply the AS3-accurate
   * skill damage (skillDamageReal, keyed by the hitbox's actionName) and queue
   * it onto the shared incoming-hit channel. Damage is the real formula now, no
   * artificial scale. Multi-hit (hitIntervalFrames/maxHits) is simplified to a
   * single application per box — full multi-tick is a later pass.
   */
  private scheduleSkillHit(hb: SkillHitbox, skillLevel: number, atk: number): void {
    if (hb.visualOnly) return
    const realId = REAL_SKILL_BY_ACTION[hb.actionName]
    if (!realId) return // unknown/visual sub-variant: no damage
    const dmg = Math.max(1, Math.round(calculateRealSkillDamage(realId, skillLevel, atk)))
    const fire = (): void => {
      const facing = this.heroState.facing
      // hitstun-triad pen: anchor on the hero's real visual center (was
      // GROUND_Y, ignoring the hero's own render offset -- same class of bug
      // as the melee box below, just never fixed for skills yet).
      const heroCenter = this.heroVisualCenter()
      const hx = heroCenter.x + facing * hb.offsetX
      const hy = heroCenter.y + hb.offsetY
      const box = centeredBox(hx, hy, hb.width, hb.height)
      // A skill box can strike several monsters; queue the hit into each.
      for (const e of this.aliveMonsters()) {
        const mBox = this.monsterHitbox(e)
        if (!overlaps(box, mBox)) continue
        const attackId = ++this.skillAttackId
        if (e.state.resolvedAttackIds.includes(attackId)) continue
        if (this.queueOrSendHeroHit(e, attackId, dmg)) {
          const mcs = this.monsterVisualCenter(e)
          this.floatText(mcs.x, this.monsterVisibleTopY(e) - 14, `${dmg}`, 'damage')
          this.cameras.main.shake(55, 0.0015)
        }
      }
    }
    if (hb.activeAfterMs > 0) this.time.delayedCall(hb.activeAfterMs, fire)
    else fire()
  }

  private buildBackground(): void {
    // Layering (fixing the old right-edge seam): bg11 is the OPAQUE base scene
    // (palace on clouds, 1132×3051) — the old code tiled it as a narrow front
    // layer, which wrapped and produced the seam while also hiding the detail
    // layers. It is now a slow covering Image behind everything. bg13 (南天门
    // gate panorama) and bg12 (lotus railing) are TRANSPARENT 4900px-wide
    // panoramas that parallax on top and never wrap within the camera's range.
    // Reset accumulators that persist across a scene restart (their old game
    // objects were destroyed on shutdown; keeping stale refs crashes swapBackground).
    this.bgTiles = []
    this.bg12Layer = undefined
    this.bg13Layer = undefined
    this.pillarBg = undefined
    this.climbSceneArt = undefined
    this.climbClouds = []
    this.debugTexts = []
    this.drops = []
    this.dropSprites.clear()
    this.enemyProjectiles = []
    this.enemyProjectileSprites.clear()
    this.nextEnemyProjectileId = 1
    this.playedHitIds.clear()
    this.monsters = []
    this.coopMonsterIds = new WeakMap<MonsterEntity, string>()
    this.coopMonsterById.clear()
    this.coopNextMonsterId = 1
    this.coopSentHitIntents.clear()
    this.coopBossDefeatedSent = false
    this.bossEntity = null
    this.activeMiniBoss = null
    this.bgBase = this.add
      .image(0, 0, 'bg11')
      .setOrigin(0, 0)
      .setScrollFactor(0.12, 0) // 1132px covers the 960 viewport across the pan
      .setDepth(-40)
    for (const [key, depth, factor] of [
      ['bg13', -30, 0.28],
      // bg12 is the lotus FOREGROUND (leaves + flowers + railings); it sits in
      // front of the floor cloud band so the lotus reads as the ground edge.
      ['bg12', -8, 0.5],
    ] as [string, number, number][]) {
      const ts = this.add.tileSprite(0, 0, 960, 540, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth)
      this.bgTiles.push({ img: ts, factor })
    }
    // Ground band: the level floor art (floorBgN) is a WHOLE scene — palace +
    // rainbow on top, 雕花石台 platform + foreground clouds below. Showing it
    // whole re-drew the rainbow at the bottom (the seam). Crop off the top
    // ~27% (rainbow + palace, already covered by bg11) and place only the
    // platform + clouds band at the hero's feet.
    this.floorImg = this.add.image(0, FLOOR_TOP_Y, 'floorBg1').setOrigin(0, 0).setScrollFactor(0.9, 0).setDepth(-10)
    this.placeFloor('floorBg1')
    this.buildL1GroundLayers()
  }

  /** L1's bg12 (莲池华表)/bg13 (南天门长廊) ground-segment art, materialized via
   * the prefab pipeline (tools/prefab-compiler; compiled JSON formalized to
   * game/src/data/prefab/bg1{2,3}.prefab.json -- tasks/battle-fidelity-report.md).
   * Both compile to a single-image container (bg12/bg13 are monolithic
   * painted symbols with no internal sub-structure -- confirmed by
   * inspecting the compiled JSON: one child image, identity matrix), so
   * PrefabLoader mainly buys origin-fraction-correct anchoring here rather
   * than a decomposed scene graph; the textures are already loaded under
   * 'bg12'/'bg13' (preload()), hence the textureKeyFor override below
   * instead of the compiler's own per-symbol texture directory. Built once;
   * scale/position/visibility are applied per-level in swapBackground().
   */
  private buildL1GroundLayers(): void {
    const loader = new PrefabLoader(this)
    this.bg12Layer = loader.build(bg12PrefabDoc as unknown as PrefabDocument, {
      textureKeyFor: () => 'bg12',
    }).root
    this.bg12Layer.setDepth(-8)
    this.bg13Layer = loader.build(bg13PrefabDoc as unknown as PrefabDocument, {
      textureKeyFor: () => 'bg13',
    }).root
    this.bg13Layer.setDepth(-30)
  }

  /** L1 ground segment's walkway: the REAL carved-stone corridor floor,
   * recovered from the Online client's `stageInfo` package (`export.gameSence.
   * sl12`/`sl13`, DefineSprite 335/323 -- these are the level's own static
   * scene timeline, not the swappable "bg" backdrop class; the floor is baked
   * directly into the walkable scene, separately from bg11/12/13). team-lead's
   * return (2026-07-08) established the reference screenshot is an Online
   * capture and this exact corridor (with the same baked "4399" watermark
   * tiling) is Online-only -- vendor's bg12/bg13/floorBg1 genuinely have no
   * equivalent (verified exhaustively before this find, see report §0).
   * Extraction: `1.swf` fetched live off the 4399 CDN turned out to be
   * byte-for-byte the same level-1 package vendor already has (same bg11/12/
   * 13/floorBg1/Monster2-30 symbol table) -- no new floor there. The floor
   * band instead lives in `stageInfo`'s consolidated sl11/12/13 (all levels'
   * interactive-scene logic in one file); its own timeline still carries the
   * static floor art alongside the StopPoint/MonsterAppearPoint markers.
   * Reuses the shared floorImg object; only called for L1. */
  private placeL1GroundBand(): void {
    if (!this.floorImg || !this.textures.exists('online_floor12')) return
    this.floorImg.setVisible(true) // undo a previous L2-L4 visit's hide (see swapBackground's else-branch)
    this.floorImg.setTexture('online_floor12')
    this.floorImg.setPosition(0, L1_GROUND_BAND_Y)
    this.floorImg.setScale(L1_GROUND_BAND_SCALE)
  }

  /** Point the floor image at a level's floor art, cropped to its ground band. */
  private placeFloor(key: string): void {
    if (!this.floorImg || !this.textures.exists(key)) return
    const src = this.textures.get(key).getSourceImage() as { width: number; height: number }
    const frameName = `${key}__ground`
    const tex = this.textures.get(key)
    if (!tex.has(frameName)) {
      const top = Math.round(src.height * FLOOR_CROP_TOP)
      tex.add(frameName, 0, 0, top, src.width, src.height - top)
    }
    this.floorImg.setTexture(key, frameName)
    this.floorImg.setPosition(0, FLOOR_TOP_Y)
    this.floorImg.scaleX = Math.max(1, (960 + (WORLD_W - 960) * 0.9 + 40) / src.width)
    this.floorImg.scaleY = 1
  }

  /** Swap the parallax + floor textures to a level's own art (L1 uses bg1x, L2
   * bg2x, ...; L4 only has bg41 so its two detail layers reuse it). L1's
   * ground-mode base/mid-ground layers are the new prefab-built bg12Layer/
   * bg13Layer (see buildL1GroundLayers) instead of bgTiles -- bgTiles is
   * hidden for L1 and stays the L2-L4 renderer, unchanged. */
  private swapBackground(levelIndex: number): void {
    const n = levelIndex + 1
    const base = n === 1 ? 'floorBg1' : `bg${n}1`
    const baseScale = n === 1 ? GROUND_BG_SCALE : 1
    const far = this.textures.exists(`bg${n}3`) ? `bg${n}3` : `bg${n}1`
    const near = this.textures.exists(`bg${n}2`) ? `bg${n}2` : `bg${n}1`
    const floor = n === 1 ? 'floorBg1' : `floorBg${n}`
    if (this.textures.exists(base)) {
      // '__BASE' pinned explicitly: floorBg1's shared Texture object also
      // carries a custom cropped sub-frame added by placeFloor() (floorImg's
      // ground-band crop) -- omitting the frame here let Phaser fall back to
      // that stale crop instead of the full image (root cause of the
      // "palace almost invisible" report: bgBase was silently rendering
      // floorBg1's bottom 504px crop, not the full 690px image).
      this.bgBase?.setTexture(base, '__BASE')
      this.bgBase?.setScale(baseScale)
      this.bgBase?.setPosition(n === 1 ? GROUND_BG_X : 0, n === 1 ? GROUND_BG_Y : 0)
    }
    const isL1 = n === 1
    this.bg12Layer?.setVisible(isL1)
    this.bg13Layer?.setVisible(isL1)
    if (isL1) {
      this.bg12Layer?.setScale(GROUND_BG12_SCALE).setPosition(0, GROUND_BG12_Y).setScrollFactor(0.55, 0)
      this.bg13Layer?.setScale(GROUND_BG13_SCALE).setPosition(GROUND_BG13_X, GROUND_BG13_Y).setScrollFactor(0.4, 0)
      for (const { img } of this.bgTiles) img.setVisible(false)
      this.placeL1GroundBand()
    } else {
      for (const { img } of this.bgTiles) img.setVisible(true)
      if (this.bgTiles[0] && this.textures.exists(far)) this.bgTiles[0].img.setTexture(far)
      if (this.bgTiles[1] && this.textures.exists(near)) this.bgTiles[1].img.setTexture(near)
      // L2-L4 have no floorBgN texture (confirmed genuinely absent in the
      // source, not an extraction bug -- see the preload() comment above);
      // floorImg is only ever repositioned/re-textured by placeFloor(), so
      // without an explicit hide here it would keep showing whatever level's
      // floor art (or L1's near ground band) was on screen before switching
      // to one of these levels.
      if (this.textures.exists(floor)) {
        this.floorImg?.setVisible(true)
        this.placeFloor(floor)
      } else {
        this.floorImg?.setVisible(false)
      }
    }
  }

  private registerAnimations(data: RoleData, tex: string, loop: Set<string>, prefix: string): void {
    for (const [name, spec] of Object.entries(data.actions)) {
      // Anims live on the global AnimationManager and survive scene restarts —
      // don't re-create (which warns) when returning to a level we've seen.
      if (this.anims.exists(prefix + name)) continue
      const frames = actionFrameTimings(data.sheet, spec as ActionSpec, TICK_MS).map((t) => ({
        key: tex,
        frame: t.index,
        duration: t.durationMs,
      }))
      this.anims.create({ key: prefix + name, frames, repeat: loop.has(name) ? -1 : 0 })
    }
  }

  /**
   * 太上老君 idle loop from row 0 of the boss sheet. No initBBDC stopCounts
   * exist for this repurposed boss art, so use a uniform slow per-frame duration.
   */
  private registerNpcIdle(): void {
    if (this.anims.exists(NPC_ANIM_PREFIX + 'wait')) return
    const frames = []
    for (let i = 0; i < NPC_WAIT_FRAMES; i++) {
      frames.push({ key: NPC_TEX, frame: i, duration: NPC_IDLE_FRAME_MS })
    }
    this.anims.create({ key: NPC_ANIM_PREFIX + 'wait', frames, repeat: -1 })
  }

  // l1-truth pen: the real AS3 `export.mapObject.TransferWind` (a 10-frame
  // swirling-wind sprite, DefineSprite_1039, already extracted to
  // vendor/extracted/OtherMat1/.../1.png..10.png -- copied verbatim into this
  // project's own public/assets/extracted/effects/) is the closest native
  // asset to this scene's own "walk into a glowing portal to leave the
  // arena" construct (see showPortal()'s own comment: that transition itself
  // is this remake's own invention, not a literal AS3 flow -- TransferWind is
  // just the most fitting original swirl asset to render it with, not a
  // reconstruction of a specific original screen). Each frame is its own
  // PNG (not a packed spritesheet), so this is a manual multi-texture
  // animation rather than registerAnimations()'s spritesheet-index path.
  private registerTransferWind(): void {
    if (this.anims.exists('transferwind')) return
    const frames = []
    for (let i = 1; i <= TRANSFERWIND_FRAME_COUNT; i++) {
      frames.push({ key: `transferwind_${i}` })
    }
    this.anims.create({ key: 'transferwind', frames, frameRate: 12, repeat: -1 })
  }

  private registerRole1Effects(): void {
    for (const [action, spec] of Object.entries(ROLE1_EFFECTS) as [Role1EffectAction, (typeof ROLE1_EFFECTS)[Role1EffectAction]][]) {
      const animKey = `role1_fx_anim_${action}`
      if (this.anims.exists(animKey)) continue
      this.anims.create({
        key: animKey,
        frames: Array.from({ length: spec.frames }, (_, index) => ({
          key: role1EffectFrameKey(action, index + 1),
        })),
        frameRate: spec.fps,
        repeat: 0,
      })
    }
  }

  private registerMonsterHit1Effects(): void {
    for (const phase of monsterHit1EffectPhases()) {
      if (phase.kind === 'hitbox-only') continue
      const animKey = monsterHit1EffectAnimationKey(phase)
      if (this.anims.exists(animKey)) continue
      this.anims.create({
        key: animKey,
        frames: Array.from({ length: phase.shippedFrames }, (_, index) => ({
          key: monsterHit1EffectFrameKey(phase, index + 1),
        })),
        frameRate: phase.fps,
        // Monster30's adapted moving collision entity can outlive one source
        // rotation; keep its official blade visible until that entity hits or
        // expires. Every attached melee effect plays once and self-destructs.
        repeat: phase.sourceSymbol === 'Monster30Bullet1' ? -1 : 0,
      })
    }
  }

  private comboStageDurations(): number[] {
    const dur = (a: string): number => actionDurationMs(roleData.actions[a] as ActionSpec, TICK_MS)
    return [0, dur('hit1'), dur('hit2'), dur('hit3'), dur('hit4'), dur('hit5')]
  }

  // ---------- level / monster manager ----------

  private currentCampaignName(): string {
    if (this.level1Chain) return currentSubStage(this.level1Chain).name
    return CAMPAIGN[this.campaignIndex].name
  }

  private activeDoor(): { x: number; y: number; width: number; height: number; visible: boolean } {
    if (this.level1Chain) return currentSubStageDoor(this.level1Chain)
    return this.levelState.arena.door
  }

  private currentHeroBounds(): { minX: number; maxX: number } {
    if (this.level1Chain) {
      const stage = currentSubStage(this.level1Chain)
      const authorityMaxX = stage.mode === 'horizontal'
        ? horizontalHeroMaxX(
            this.levelState,
            stage.bounds.right,
            VIEWPORT_W,
            HORIZONTAL_HERO_RIGHT_INSET,
          )
        : stage.bounds.right
      const maxX = stage.mode === 'horizontal' && this.coopSession && !this.coopSession.isHost
        ? Math.min(stage.bounds.right, this.coopSyncState?.hostProgressMaxX ?? stage.heroStart.x)
        : authorityMaxX
      return { minX: stage.bounds.left, maxX }
    }
    return { minX: MIN_X, maxX: MAX_X }
  }

  private resetLiveLevelObjects(): void {
    this.pendingWaveSpawns = []
    this.coopMonsterIds = new WeakMap<MonsterEntity, string>()
    this.coopMonsterById.clear()
    this.coopNextMonsterId = 1
    this.coopSentHitIntents.clear()
    this.coopRemoteAttackIds.clear()
    if (this.coopSyncState) {
      this.coopSyncState = { ...this.coopSyncState, monsters: {}, hostProgressMaxX: undefined }
    }
    for (const e of this.monsters) {
      e.hpBar?.destroy()
      e.sprite.destroy()
    }
    this.monsters = []
    this.bossEntity = null
    this.activeMiniBoss = null
    this.portal?.setVisible(false)
    this.bossBar?.setVisible(false)
    this.dialogue?.close()
    this.backpack?.close()
    this.furnacePanel?.close()
    this.resultBanner?.hide()
    this.bannerTimer?.remove(false)
  }

  private levelDefForSubStage(stage: SubStageDef): LevelDef {
    if (stage.waveLevel) return stage.waveLevel
    const boss = stage.continuousSpawner?.heightTrigger?.boss ?? {
      species: 'monster3',
      stats: LEVEL1_MONSTER_STATS.monster3,
      label: LEVEL1_MONSTER_NAMES.monster3,
      x: 750,
      y: -2050,
    }
    return {
      id: `level-1-${stage.id}`,
      name: stage.name,
      spawnIntervalMs: 6000,
      stopPoints: [],
      boss,
      door: stage.door,
      arenaBounds: stage.bounds,
    }
  }

  /** (Re)start a campaign level: reset the wave/boss machine, clear monsters,
   * swap the background art, and flash a name banner. */
  private startLevel(index: number): void {
    this.campaignIndex = Math.min(Math.max(0, index), CAMPAIGN.length - 1)
    const def = CAMPAIGN[this.campaignIndex]
    this.resetLiveLevelObjects()
    if (isSubStageCampaign(def)) {
      this.level1Chain = createSubStageChainState(def)
      this.enterLevel1SubStage()
      return
    }
    this.level1Chain = undefined
    this.level1Spawner = undefined
    this.levelState = createLevelState(def)
    this.pillarBg?.setVisible(false)
    this.climbSceneArt?.setVisible(false)
    this.bgBase?.setVisible(true)
    this.rebuildClimbClouds(false)
    this.swapBackground(this.campaignIndex)
    this.showLevelBanner(def.name)
    this.resetClimbState()
  }

  private enterLevel1SubStage(): void {
    if (!this.level1Chain) return
    const stage = currentSubStage(this.level1Chain)
    this.resetLiveLevelObjects()
    this.levelState = createLevelState(this.levelDefForSubStage(stage))
    this.currentWalls = wallsForLevel1SubStage(stage)
    this.climbActive = stage.mode === 'climb'
    this.level1Spawner = stage.continuousSpawner ? createContinuousSpawnerState(stage.continuousSpawner) : undefined

    this.heroConfig.jump.groundY = stage.heroStart.y
    this.heroConfig.jump.platformResolver = (q) => resolveVerticalMotion(this.currentWalls, q)
    this.heroConfig.resolveHorizontal = (q) => resolveHorizontalMotion(this.currentWalls, q).x
    this.heroConfig.minX = stage.bounds.left
    this.heroConfig.maxX = stage.bounds.right
    this.heroState.x = stage.heroStart.x
    this.heroState.vertical.y = stage.heroStart.y
    this.heroState.vertical.vy = 0
    this.heroState.vertical.grounded = true
    this.heroState.vertical.jumpCount = 0
    this.heroState.vertical.airAction = null

    const bgPlacement =
      stage.mode === 'climb'
        ? computeBg11ClimbPlacement()
        : { x: stage.bounds.left, y: stage.bounds.top, scrollFactorX: 0.35, scrollFactorY: 0 }
    const isClimb = stage.mode === 'climb'
    const cameraBounds = isClimb ? computeLevel1ClimbCameraBounds(stage.bounds) : stage.bounds
    this.cameras.main.setBounds(
      cameraBounds.left,
      cameraBounds.top,
      cameraBounds.right - cameraBounds.left,
      cameraBounds.bottom - cameraBounds.top,
    )
    this.cameras.main.startFollow(this.hero, true, 0.1, isClimb ? 0.1 : 0)
    if (!isClimb) {
      this.updateHorizontalCameraLock()
      this.cameras.main.setScroll(this.cameras.main.scrollX, 0)
    }
    // 爬塔段背景 = 生图柱墙 tileSprite（2026-07-10 换装，替代 bg11 云海——
    // 原版此段是云纹雕柱塔身）；bg11 仍是 sl12/13 与其他关卡的 bgBase 底。
    if (isClimb) {
      const background = climbBackgroundVisibility(this.textures.exists('pillar_wall'))
      if (!this.pillarBg && background.pillar) {
        const texture = this.textures.get('pillar_wall')
        const source = texture.getSourceImage() as { height: number }
        const frameName = 'pillar_wall__continuous'
        if (!texture.has(frameName)) {
          const frame = pillarTileFrame(source.height)
          texture.add(frameName, 0, frame.x, frame.y, frame.width, frame.height)
        }
        this.pillarBg = this.add
          .tileSprite(
            stage.bounds.left - 120,
            -2380,
            stage.bounds.right - stage.bounds.left + 240,
            3080,
            'pillar_wall',
            frameName,
          )
          .setOrigin(0, 0)
          .setDepth(-40)
        this.pillarBg.setTileScale(1300 / 864 / 1.5, 1300 / 864 / 1.5)
      }
      this.pillarBg?.setVisible(background.pillar)
      this.bgBase?.setVisible(background.fallback)
      if (background.fallback) {
        this.bgBase?.setTexture(stage.background.base, '__BASE').setScale(1).setPosition(bgPlacement.x, bgPlacement.y)
        this.bgBase?.setScrollFactor(bgPlacement.scrollFactorX, bgPlacement.scrollFactorY)
      }
      if (this.textures.exists(SL11_SCENE_ART_TEX)) {
        const placement = climbSceneArtPlacement()
        if (!this.climbSceneArt) {
          this.climbSceneArt = this.add
            .image(placement.x, placement.y, SL11_SCENE_ART_TEX)
            .setOrigin(0, 0)
            .setDepth(3)
        }
        this.climbSceneArt
          .setPosition(placement.x, placement.y)
          .setScale(placement.scale)
          .setScrollFactor(1, 1)
          .setVisible(true)
      }
    } else {
      this.pillarBg?.setVisible(false)
      this.climbSceneArt?.setVisible(false)
      this.bgBase?.setVisible(true)
      this.bgBase
        ?.setTexture(stage.background.base, '__BASE')
        .setScale(1)
        .setPosition(0, 0)
        .setScrollFactor(stage.background.scrollFactorX ?? 0, 0)
    }
    this.bg12Layer?.setVisible(stage.background.foreground === 'bg12')
    this.bg13Layer?.setVisible(stage.background.foreground === 'bg13')
    this.bg12Layer?.setScale(1).setPosition(0, 0).setScrollFactor(1, 0)
    this.bg13Layer?.setScale(1).setPosition(0, 0).setScrollFactor(1, 0)
    if (stage.background.floor && this.floorImg && this.textures.exists(stage.background.floor)) {
      this.floorImg
        .setVisible(true)
        .setTexture(stage.background.floor)
        .setPosition(stage.background.floorX ?? 0, GROUND_Y - 5)
        .setScale(1)
        .setScrollFactor(1, 1)
    } else {
      this.floorImg?.setVisible(false)
    }
    for (const { img } of this.bgTiles) img.setVisible(false)
    this.rebuildClimbClouds(stage.mode === 'climb')
    this.rebuildPlatformDebugOverlay()
    this.showLevelBanner(stage.name)
  }

  /** L1 爬塔段：给每块云带内的可穿透平台铺真云视觉（素材=bg11 裁切羽化片，
   * 见 preload 注释），并在镜头范围里撒几朵慢速漂云做纵深。此前平台只有
   * debug 线框（正常游玩不可见），开局又正对 bg11 最空的下段云雾，整屏读作
   * "没贴图"——2026-07-09 用户反馈修正。 */
  private rebuildClimbClouds(active: boolean): void {
    for (const o of this.climbClouds) o.destroy()
    this.climbClouds = []
    if (!active || !this.textures.exists('cloud_puff1')) return
    if (this.climbSceneArt?.visible) return
    // 平台可视化 = 在碰撞矩形内部平铺贴图（用户 23:2x 拍板的做法，云朵方案
    // 全废）：贴图为生图的雕花玉石横梁 platform_beam（原版参照见 preload 注释），
    // tileSprite 左上角对齐 wall.x/wall.y，宽度=碰撞宽度，站立线=梁顶轨。
    // sl11 的墙来自 mined 几何（level1-geometry.json）：平台宽 240~455；两条
    // 1100 宽全场穿透膜是塔段出入口而非平台，跳过。
    if (this.textures.exists('platform_beam')) {
      const beamSrcH = (this.textures.get('platform_beam').getSourceImage() as { height: number }).height
      for (const wall of this.currentWalls) {
        if (wall.type === 'solid') continue
        // 2026-07-10 02:0x 用户踩空实锤：1100 宽的段间穿透地板（-1872 的
        // throughUpButDown 等）是真实可站立平台，此前被当"出入口膜"跳过不
        // 铺贴图——tileSprite 平铺不怕宽，一律铺梁。
        const h = Math.min(46, Math.max(32, wall.width * 0.16))
        const beam = this.add
          .tileSprite(wall.x, wall.y + STAND_SINK, wall.width, h, 'platform_beam')
          .setOrigin(0, 0)
          .setDepth(3)
        const sc = h / beamSrcH
        beam.setTileScale(sc, sc)
        this.climbClouds.push(beam)
      }
      // 塔底地面：同款梁加厚一档，铺满可行走区（GROUND_Y 是隐式地面，没有
      // 对应 wall，原先悟空开局站在纯色雾里）。
      const floorH = 78
      const floor = this.add.tileSprite(-80, GROUND_Y + STAND_SINK, 1320, floorH, 'platform_beam').setOrigin(0, 0).setDepth(3)
      floor.setTileScale(floorH / beamSrcH / 1.6, floorH / beamSrcH)
      this.climbClouds.push(floor)
    }
    // 氛围漂云：低视差、慢漂移，填 bg11 下段的空旷区。
    const drift = [
      { x: 200, y: 240, s: 0.55, w: 300 },
      { x: 760, y: -160, s: 0.45, w: 340 },
      { x: 420, y: -700, s: 0.5, w: 320 },
      { x: 880, y: -1240, s: 0.42, w: 360 },
      { x: 240, y: -1700, s: 0.5, w: 300 },
    ]
    drift.forEach((d, j) => {
      const img = this.add
        .image(d.x, d.y, j % 2 === 0 ? 'cloud_puff2' : 'cloud_puff1')
        .setDepth(-20)
        .setAlpha(0.5) // 压低到明显弱于平台云，避免被误读成可站立
        .setScrollFactor(d.s, 1)
      img.displayWidth = d.w
      img.displayHeight = d.w * 0.42
      this.tweens.add({
        targets: img,
        x: d.x + (j % 2 === 0 ? 46 : -46),
        duration: 6000 + j * 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.climbClouds.push(img)
    })
  }

  private updateLevel1(delta: number): void {
    if (!this.level1Chain) return
    const stage = currentSubStage(this.level1Chain)
    const heroAlive = !isHeroDead(this.identity)
    const runsAuthority = !this.coopSession || this.coopSession.isHost

    if (runsAuthority && stage.mode === 'climb' && this.level1Spawner) {
      const update = updateContinuousSpawner(
        this.level1Spawner,
        { x: this.heroState.x, y: this.heroState.vertical.y, alive: heroAlive },
        delta,
        Math.random,
      )
      for (const spawn of update.spawns) this.spawnEntity(spawn.species, spawn.stats, spawn.x, false, spawn.y)
      if (update.bossSpawn && !this.bossEntity) {
        const boss = this.spawnEntity(update.bossSpawn.species, update.bossSpawn.stats, update.bossSpawn.x, true, update.bossSpawn.y)
        this.bossEntity = boss
        this.levelState.arena.state = 'active'
        this.levelState.arena.boss = boss.state
        this.showToast(`BOSS · ${update.bossSpawn.label}`, '#ff9a5a')
      }
    } else if (runsAuthority && stage.waveLevel) {
      if (updateLevelSpawn(this.levelState, this.aliveGruntCount() + this.pendingWaveSpawns.length, 1, this.heroState.x)) {
        this.spawnActiveWave()
      }
    }
    if (runsAuthority) this.drainPendingWaveSpawns(delta)

    if (!this.coopSession) for (const e of this.monsters) this.advanceEntity(e, delta, heroAlive)
    else this.updateCoopMonsters(delta, heroAlive)
    this.reapMonsters()

    const door = currentSubStageDoor(this.level1Chain)
    const climbBossDead = stage.mode === 'climb' && this.bossEntity && isBossDead(this.bossEntity.state)
    const wavesCleared =
      stage.mode === 'horizontal' &&
      areStopPointsCleared(this.levelState) &&
      this.aliveGruntCount() + this.pendingWaveSpawns.length === 0
    if (runsAuthority && (climbBossDead || wavesCleared) && !door.visible) {
      markCurrentSubStageCleared(this.level1Chain)
      const isFinalSubStage = this.level1Chain.currentIndex === this.level1Chain.def.subStages.length - 1
      if (isFinalSubStage) this.showResultBanner()
      else this.showPortal()
    }
  }

  /** Restores the pre-climb config/camera. Called both when finishing the
   * climb and (defensively) whenever a non-L1 level starts, so a mid-climb
   * scene restart or debug level jump can never strand the hero in the
   * narrowed corridor or the tall camera bounds. */
  private resetClimbState(): void {
    this.climbActive = false
    this.climbSceneArt?.setVisible(false)
    this.currentWalls = []
    this.heroConfig.jump.platformResolver = undefined
    this.heroConfig.resolveHorizontal = undefined
    this.heroConfig.jump.groundY = GROUND_Y
    this.heroConfig.minX = MIN_X
    this.heroConfig.maxX = MAX_X
    this.cameras.main.setBounds(0, 0, WORLD_W, 540)
    this.bgBase?.setScrollFactor(0.12, 0)
    this.clearPlatformDebugOverlay()
  }

  private showLevelBanner(name: string): void {
    this.levelBanner?.destroy()
    const t = this.add
      .text(480, 120, `第 ${this.campaignIndex + 1} 关 · ${name}`, {
        fontSize: '30px',
        color: '#ffe9b0',
        fontStyle: 'bold',
        stroke: '#3a2a10',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(130)
    this.levelBanner = t
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 900, onComplete: () => t.destroy() })
  }

  /** Build a monsterSim config for a species from its own action-table durations
   * (hurt/hit1/dead) and the level pack's stats. */
  private monsterConfigFor(species: string, stats: MonsterStats, isBoss: boolean): MonsterConfig {
    const data = MONSTER_DATA[species] ?? MONSTER_DATA.monster30
    const dur = (a: string, fallback: number): number =>
      data.actions[a] ? actionDurationMs(data.actions[a] as ActionSpec, TICK_MS) : fallback
    const attackSpec = monsterAttackSpecFor(species, 'hit1') ?? fallbackMonsterAttackSpec('hit1', stats.attackRange)
    const bounds = this.level1Chain ? currentSubStage(this.level1Chain).bounds : { left: MIN_X, right: MAX_X }
    return {
      stats,
      patrolMin: bounds.left + 80,
      patrolMax: bounds.right - 80,
      hurtDurationMs: dur('hurt', 260),
      attackDurationMs: dur('hit1', 400),
      deadDurationMs: dur('dead', 600),
      attackCooldownMs: 1000,
      decisionIntervalMs: 1000,
      tickMs: TICK_MS,
      rng: Math.random,
      attackSpec,
      targetingGeometry: {
        selfOffsetX: data.offset.x * HERO_SCALE,
        targetOffsetX: roleData.offset.x * HERO_SCALE,
        attackReach:
          species === 'monster30'
            ? stats.attackRange
            : Math.max(0, horizontalAttackReach(attackSpec, HERO_HURTBOX_W) - 1),
      },
      rangedAttack: species === 'monster30' ? MONSTER30_BULLET : undefined,
      // StageListener11: Monster30 is a flying, gravity-free climb threat.
      // Keep vertical pursuit opt-in so ground waves and L2-L4 remain on the
      // previous x-only monsterSim path.
      verticalFollow:
        species === 'monster30' && this.climbActive
          ? { enabled: true, speed: stats.speed, arriveThreshold: 20 }
          : undefined,
      isBoss,
    }
  }

  /** Raw (pre-mitigation) attack power a species deals to the hero -- see
   * MONSTER_HIT1_POWER's header for the real AS3 source. Falls back to the
   * old def-derived heuristic only for a species this table doesn't cover
   * (defensive: no L1/L2 species should ever hit this branch). */
  private monsterAttackPower(species: string, stats: MonsterStats): { power: number; kind: AttackKind } {
    const real = MONSTER_HIT1_POWER[species]
    if (real) return real
    return { power: Math.min(60, 8 + stats.def * 1.5), kind: 'physics' }
  }

  /** `y` defaults to GROUND_Y for existing ground callers; sl11's continuous
   * spawner passes raw AS3 scene y values so Monster30 and 巫鹰 live at climb
   * altitude instead of on the flat arena line. */
  private spawnEntity(
    species: string,
    stats: MonsterStats,
    x: number,
    isBoss: boolean,
    y: number = GROUND_Y,
    coopMonsterId?: string,
  ): MonsterEntity {
    const data = MONSTER_DATA[species] ?? MONSTER_DATA.monster30
    const config = this.monsterConfigFor(species, stats, isBoss)
    const state = initMonster(config, x, y)
    const tex = this.textures.exists(species) ? species : 'monster30'
    // Every species sheet is a native SWF-pixel export in the same coordinate
    // space as the hero's — a boss's SWF art is simply drawn bigger, a small
    // grunt's smaller. So every sprite (grunt or boss) gets the *same*
    // px->world factor as the hero (HERO_SCALE); relative size is then
    // whatever the original art already encodes, with no per-cell "stretch to
    // 200px" normalization and no artificial isBoss multiplier. Verified
    // against docs/reference/zmxy-online-screens/combat-damage.png (turtle
    // grunt ~85-95% of hero height) and the SWF's own idle-frame silhouettes
    // (monster-scale-report.md).
    const scale = HERO_SCALE
    const isMiniBoss = MINIBOSS_SPECIES.has(species)
    const sprite = this.add.sprite(x, y, tex).setScale(scale).setDepth(isBoss || isMiniBoss ? 9 : 8)
    const atk = this.monsterAttackPower(species, stats)
    const skillGate = MONSTER_SKILL_GATES[species]
    const entity: MonsterEntity = {
      species,
      state,
      config,
      sprite,
      data,
      scale,
      attackPower: atk.power,
      attackKind: atk.kind,
      isBoss,
      attackId: 0,
      burn: null,
      frozenUntilMs: 0,
      hitQueue: [],
      // Grunts get a head HP bar; the arena boss and minibosses (l1-truth
      // pen: they borrow the top BossHpBar too, see activeMiniBoss) don't.
      hpBar: isBoss || isMiniBoss ? undefined : new MonsterHpBar(this),
      skillGate,
      skillOverlay: skillGate ? createSkillOverlayState(skillGate) : undefined,
    }
    this.monsters.push(entity)
    if (coopMonsterId) this.bindCoopMonsterId(entity, coopMonsterId)
    else if (this.coopSession) this.coopMonsterId(entity)
    return entity
  }

  private spawnActiveWave(): void {
    this.pendingWaveSpawns.push(...createWaveSpawnQueue(getActiveWaveRoster(this.levelState)))
  }

  private drainPendingWaveSpawns(delta: number): void {
    const bounds = this.level1Chain ? currentSubStage(this.level1Chain).bounds : { left: MIN_X, right: MAX_X }
    const capacity = waveMonsterCapacity(Boolean(this.coopSession))
    const availableSlots = capacity - this.aliveGruntCount()
    const ready = advanceWaveSpawnQueue(this.pendingWaveSpawns, delta, availableSlots)
    ready.forEach((spec: MonsterSpawnSpec, index) => {
      const x = spec.x ?? Math.min(bounds.right - 120, Math.max(bounds.left + 120, 720 + index * 190))
      const entity = this.spawnEntity(spec.species, spec.stats, x, false, spec.y)
      if (MINIBOSS_SPECIES.has(spec.species)) {
        this.activeMiniBoss = entity
        this.showToast(`BOSS · ${MONSTER_NAMES[spec.species] ?? spec.species}`, '#ff9a5a')
      }
    })
  }

  private aliveGruntCount(): number {
    return this.monsters.filter(
      (e) => !e.isBoss && e.state.mode !== 'dead' && e.state.mode !== 'gone',
    ).length
  }

  // ---------- boss HP bar ----------

  private updateBossHud(): void {
    type Candidate = BossHudMonster & { entity: MonsterEntity }
    const candidates: Candidate[] = this.monsters.map((entity, index) => ({
      id: `${entity.species}:${index}`,
      mode: entity.state.mode,
      hp: entity.state.hp,
      arenaBoss: entity === this.bossEntity,
      miniBoss: MINIBOSS_SPECIES.has(entity.species),
      entity,
    }))
    const selected = selectBossHudMonster(
      candidates.find((candidate) => candidate.entity === this.bossEntity) ?? null,
      candidates.find((candidate) => candidate.entity === this.activeMiniBoss) ?? null,
      candidates,
    )
    if (selected) {
      if (selected.miniBoss) this.activeMiniBoss = selected.entity
      const e = selected.entity
      this.bossBar.setVisible(true)
      this.bossBar.update({
        name: MONSTER_NAMES[e.species] ?? e.species,
        hp: e.state.hp,
        maxHp: e.config.stats.hp,
      })
      return
    }
    this.activeMiniBoss = null
    this.bossBar.setVisible(false)
  }

  // ---------- portal / level advance ----------

  private showPortal(): void {
    const door = this.activeDoor()
    const climb = Boolean(this.level1Chain && currentSubStage(this.level1Chain).mode === 'climb')
    const { x: cx, y: cy } = transferDoorVisualCenter(door, climb)
    if (!this.portal) {
      // l1-truth pen: real AS3 TransferWind swirl (10-frame loop) replaces
      // the old rectangle+star placeholder -- see registerTransferWind()'s
      // header. Scaled to roughly the same on-screen footprint the old
      // placeholder occupied (~150px tall).
      const swirl = this.add.sprite(0, -10, 'transferwind_1').setScale(1.4)
      swirl.play('transferwind')
      const arrow = this.add
        .text(0, -112, '↑', {
          fontSize: '42px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#1768a8',
          strokeThickness: 8,
        })
        .setOrigin(0.5)
      const label = this.add
        .text(0, -82, '传送', {
          fontSize: '18px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#16466b',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
      this.portal = this.add.container(cx, cy, [swirl, arrow, label]).setDepth(9.5)
      this.tweens.add({ targets: arrow, y: -122, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    }
    this.portal.setPosition(cx, cy).setVisible(true)
    // "进入下一关" is wrong wording once this is the last ACTIVE campaign
    // level (currently L2, ACTIVE_CAMPAIGN_LENGTH -- L3/L4 code stays in the
    // repo per CLAUDE.md's scope cut but have no map entry, so there really
    // is no next level to walk into) -- the portal still just returns to the
    // world map either way, only the toast's claim about what's next changes.
    const hasFollowingSubStage =
      this.level1Chain &&
      this.level1Chain.currentIndex < this.level1Chain.def.subStages.length - 1
    const isL1SubStageDoor = Boolean(hasFollowingSubStage)
    const isFinalActiveLevel = this.campaignIndex + 1 >= ACTIVE_CAMPAIGN_LENGTH
    this.showToast(
      isL1SubStageDoor
        ? '前路已开！走进传送门 (↑)'
        : isFinalActiveLevel
          ? '妖王已除！走进传送门 (↑) 返回世界地图'
          : '妖王已除！走进传送门 (↑) 进入下一关',
      '#9fd8ff',
    )
  }

  /** If the portal is open and the hero stands in it, clear the arena and go to
   * the next level. Returns true if it consumed the interact press. */
  private tryUsePortal(): boolean {
    if (this.level1Chain) {
      const door = currentSubStageDoor(this.level1Chain)
      if (!door.visible) return false
      if (!tryAdvanceSubStage(this.level1Chain, this.heroState.x, this.heroState.vertical.y, true)) return false
      if (isSubStageChainCleared(this.level1Chain)) this.onAdvanceLevel()
      else this.enterLevel1SubStage()
      return true
    }
    if (!this.levelState.arena.door.visible) return false
    if (!tryClearArena(this.levelState, this.heroState.x, this.heroState.vertical.y, true)) return false
    this.onAdvanceLevel()
    return true
  }

  /**
   * S1 world-map hub: clearing a level no longer chains straight into the next
   * one in this scene (screen-fidelity-spec.md S1 -- "通关回 WorldMapScene，不是
   * 传送门串行"). Persist the unlock (never regressing on a replay of an earlier
   * level -- advanceCampaignFrontier), autosave, then hand off to the map; the
   * player re-enters via clicking the next node there.
   */
  private onAdvanceLevel(): void {
    // ACTIVE_CAMPAIGN_LENGTH (2, L1+L2), not CAMPAIGN.length (4) -- L3/L4's
    // level data stays in the repo per CLAUDE.md's scope cut but has no map
    // entry (campaignProgress.ts clamps every index at ACTIVE_CAMPAIGN_LENGTH-1),
    // so clearing L2 IS clearing everything currently reachable and must say
    // so, not "通关！返回世界地图" as if L3 were still coming up next.
    const clearedAll = this.campaignIndex + 1 >= ACTIVE_CAMPAIGN_LENGTH
    if (this.activeSlot !== null) {
      const frontier = readCampaignIndex(window.localStorage, this.activeSlot)
      this.campaignIndex = advanceCampaignFrontier(this.campaignIndex, frontier)
    }
    this.saveToSlot()
    this.showToast(clearedAll ? '恭喜通关全部关卡！返回世界地图' : '通关！返回世界地图', '#ffe066')
    this.time.delayedCall(900, () => {
      this.npcClient?.dispose()
      this.scene.start(SCENE.worldMap)
    })
  }

  private buildHud(): void {
    // Real battle HUD (ui/hud/): top-left RoleInfo (avatar + HP/MP/EXP + atk),
    // top boss bar, bottom-left skill dock, backpack window (toggle B).
    this.roleInfoHud = new RoleInfoHud(this, 14, 12, { scale: 1.3 })
    this.roleInfoHud.container.setScrollFactor(0).setDepth(100)
    // 名牌+血条按完整组合宽度居中；下移避开左上角色属性，而不是把整个
    // 组件横向推偏来躲遮挡。
    this.bossBar = new BossHpBar(this, 480, 70, { barWidth: 360 })
    this.bossBar.setVisible(false)
    // Dock chrome (无双 + cluster + 5 slots) flush to the bottom-left corner.
    // Cluster icons wired to their real handlers where the milestone has one
    // (背包=B toggle, 设置=Esc pause); the rest toast honestly instead of
    // silently ignoring clicks (2026-07-08 user report: "背包技能全都打不开").
    this.skillBar = new SkillBarHud(this, 2, 366, {
      scale: 1.2,
      onIconClick: (icon) => {
        if (icon === 'beibao') this.toggleBackpack()
        else if (icon === 'shezhi') this.togglePause()
        else if (icon === 'jineng') this.openSkillTreeFromBattle()
        else this.showToast('敬请期待', '#e0b060')
      },
    })
    this.skillBar.container.setScrollFactor(0).setDepth(100)
    this.backpack = new BackpackWindow(this, {
      iconKeyFor: (item) => (this.textures.exists('icon_' + item.id) ? 'icon_' + item.id : ICON_FALLBACK_KEY),
      onClose: () => this.backpack.close(),
      onEquip: (item) => this.doEquip(item),
      onUnequip: (slot) => this.doUnequip(slot),
      onSellItem: (item) => this.doSellEquipmentItem(item),
      onSell: () => this.doSellCommonEquipment(),
    })
    // 炼丹炉 forge window (replaces the old ink-dialogue craft overlay). Same
    // craft protocol: budget preview + submit run through the scene unchanged.
    this.furnacePanel = new FurnacePanel(this, {
      iconKeyFor: (item) => (this.textures.exists('icon_' + item.id) ? 'icon_' + item.id : ICON_FALLBACK_KEY),
      budgetPreview: (lots) => this.craftBudgetLine(lots),
      onCraftSubmit: (description, lots) => this.submitCraft(description, lots),
    })
    // Stage-clear result banner (boss death -> banner -> portal).
    this.resultBanner = new ResultBanner(this, {
      onContinue: () => this.dismissResultBanner(),
      onRetry: () => {
        this.resultBanner.hide()
        this.bannerTimer?.remove(false)
        this.startLevel(this.campaignIndex)
      },
    })
    this.toastUi = new Toast(this)
    this.refreshSkillBar()

    // F1 debug telemetry (hidden by default).
    this.hud = this.add
      .text(16, 100, '', { fontSize: '13px', color: '#8a93b8', fontFamily: 'monospace' })
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false)
    this.debugTexts = [this.hud]

    // (Key-help now lives in the Esc pause menu, not over the battlefield.)

    // NPC name tag (world-space, above the NPC).
    this.npcTag = this.add
      .text(NPC_X, GROUND_Y - 150, NPC_NAME, { fontSize: '16px', color: '#d9c07a' })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(BATTLE_NPC_ENABLED)
    this.promptText = this.add
      .text(NPC_X, GROUND_Y - 125, '↑ 对话', { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false)
  }

  private buildDialogue(): void {
    this.dialogue = new DialogueBox(this, {
      npcName: NPC_NAME,
      avatarTexture: NPC_TEX,
      avatarSheetFrame: 0,
      // Head region within 老君's 300×300 idle frame 0.
      avatarCrop: { x: 96, y: 30, w: 150, h: 150 },
      onSubmit: (text) => {
        this.dialogue.pushLog(`悟空：${text}`)
        this.npcClient.playerSay(NPC_ID, text, 'p1')
      },
      onClose: () => {
        this.input.keyboard!.enabled = true
      },
      // No onCraftEnter: the forge entry point lives on WorldMapScene's 炼丹炉
      // button now (screen-fidelity-spec.md S1). 老君 chat stays available here
      // unchanged; openCraftMode/furnacePanel below stay wired for the
      // __openCraft/__submitCraft acceptance hooks, just not reachable from UI.
    })
  }

  // ---------- forge (炼丹炉) ----------

  private bagMaterials(): MaterialLot[] {
    return listStacks(this.inventory)
      .filter((s) => s.item.kind === 'material')
      .map((s) => ({ item: s.item, qty: s.qty }))
  }

  private openCraftMode(): void {
    if (this.craftPending) {
      this.showToast('老君正在炼制上一件…', '#c8cfe6')
      return
    }
    const mats = this.bagMaterials()
    if (mats.length === 0) {
      this.dialogue.pushLog('（囊中空空，先去打些妖怪取材吧）')
      return
    }
    this.furnacePanel.open(mats.map((m) => ({ item: m.item, owned: m.qty })))
  }

  private craftBudgetLine(lots: MaterialLot[]): string {
    if (lots.length === 0) return '炉火预算：0 点（先择材）'
    const b = computeBudget(lots)
    return `炉火预算：${b.points} 点（atk≤${b.caps.atk} def≤${b.caps.def} hp≤${b.caps.hp}）`
  }

  private submitCraft(description: string, lots: MaterialLot[]): void {
    if (this.craftPending) return
    if (lots.length === 0) {
      this.showToast('先择些材料入炉', '#e0b060')
      return
    }
    if (description.length === 0) {
      this.showToast('说说想要什么法宝', '#e0b060')
      return
    }
    if (!this.npcClient.isOpen()) {
      this.showToast(`${NPC_NAME}正在闭关…`, '#7a7f95')
      return
    }
    const requestId = `craft-${Date.now()}-${++this.craftSeq}`
    const tx = lockMaterials(this.inventory, requestId, lots)
    if (!tx) {
      this.showToast('材料不足', '#e07a7a')
      return
    }
    const payload = buildCraftRequest(description, lots)
    const sent = this.npcClient.craftRequest(
      NPC_ID,
      requestId,
      description,
      payload.materials,
      payload.budget,
      'p1',
    )
    if (!sent) {
      refundMaterials(this.inventory, tx)
      this.showToast(`${NPC_NAME}正在闭关…材料已退回`, '#7a7f95')
      return
    }
    const timer = this.time.delayedCall(20000, () => this.onCraftTimeout(requestId))
    this.craftPending = { requestId, tx, budget: payload.budget, timer }
    this.furnacePanel.setCraftLocked(true)
    this.dialogue.pushLog(`悟空：${description}`)
    this.dialogue.pushLog('（老君将材料投入八卦炉，炉火渐炽…）')
    this.furnacePanel.clearInput()
    // Back to the dialogue: 老君's flavor/result types out there (as before).
    this.furnacePanel.close()
  }

  private clearCraftPending(): void {
    if (!this.craftPending) return
    this.craftPending.timer.remove(false)
    this.craftPending = null
    this.furnacePanel.setCraftLocked(false)
  }

  private onCraftResult(item: CraftedItem, flavor: string, requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    const validation = validateCraftedEquipment(item, pending.budget)
    if (validation.ok) {
      consumeMaterials(pending.tx)
      addItem(this.inventory, validation.item, 1)
      this.dialogue.startTypewriter(`${NPC_NAME}：${flavor}`)
      this.showToast(`炼成【${validation.item.name}】`, '#ffd873')
      this.playSfx('pickup', 0.7)
      this.saveToSlot() // autosave: bag gained a forged item
    } else {
      refundMaterials(this.inventory, pending.tx)
      this.dialogue.startTypewriter(
        `${NPC_NAME}：${flavor || '此宝虚影溃散，材料尚不足以定形。'}`,
      )
      this.showToast('材料不足以炼此宝，已退回', '#e0b060')
    }
    this.clearCraftPending()
  }

  private onCraftReject(reason: string, requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    refundMaterials(this.inventory, pending.tx)
    this.dialogue.pushLog(`（炼制未成：${reason}，材料已退回）`)
    this.showToast('炼制未成，材料已退回', '#e07a7a')
    this.clearCraftPending()
  }

  private onCraftTimeout(requestId: string): void {
    const pending = this.craftPending
    if (!pending || pending.requestId !== requestId) return
    refundMaterials(this.inventory, pending.tx)
    this.dialogue.pushLog('（炉火久候无成，材料已退回）')
    this.showToast('炼制超时，材料已退回', '#e07a7a')
    this.clearCraftPending()
  }

  private connectNpc(): void {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    const url = resolveNpcServerUrl(window.location.search, env?.VITE_NPC_SERVER_URL)
    this.npcClient = new NpcClient({
      url,
      player: { id: 'p1', name: '悟空' },
    })
    this.npcClient.onStatus = (s) => {
      this.npcStatus = s
    }
    this.npcClient.onMessage = (m) => this.onNpcMessage(m)
    this.npcClient.connect()
  }

  private onNpcMessage(m: ServerMessage): void {
    switch (m.type) {
      case 'welcome':
        break
      case 'npc_thinking':
        this.dialogue.pushLog('（老君捻须思索…）')
        break
      case 'npc_say':
        this.dialogue.startTypewriter(`${NPC_NAME}：${m.text}`)
        break
      case 'give_item':
        this.receiveItem(this.npcItemToGame(m.item), m.item.qty ?? 1)
        break
      case 'craft_item':
        this.receiveItem(this.craftedToGame(m.item), 1)
        break
      case 'craft_result':
        this.onCraftResult(m.item, m.flavor, m.requestId)
        break
      case 'craft_reject':
        this.onCraftReject(m.reason, m.requestId)
        break
      case 'set_goal':
        this.showToast(`新目标：${m.goal.title}`, '#7ac7ff')
        break
      case 'error':
        break
    }
  }

  private npcItemToGame(item: NpcItem): Item {
    return { id: item.id, name: item.name, kind: npcKindToGameKind(item.kind), rarity: 1 }
  }

  private craftedToGame(item: CraftedItem): CraftedGameItem {
    return {
      id: item.id,
      name: item.name,
      kind: 'equip',
      rarity: item.rarity,
      effects: item.effects,
    }
  }

  private receiveItem(item: Item, qty: number): void {
    addItem(this.inventory, item, qty)
    this.showToast(`获得【${item.name}】`, '#ffd873')
    this.playSfx('pickup', 0.7)
  }

  private startCoopSync(): void {
    if (!this.coopSession) return
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    const baseUrl = resolveSocialServerBaseUrl(window.location.search, env?.VITE_SOCIAL_SERVER_URL)
    const client = getSharedSocialClient(baseUrl)

    try {
      this.coopConnection = client.openRoomConnection(this.coopSession.roomId)
    } catch {
      this.showToast('联机战斗连接不可用', '#e07a7a')
      return
    }

    this.coopSyncState = createCoopSyncState({
      localUserId: this.coopSession.myUserId,
      hostUserId: this.coopSession.hostUserId,
    })
    this.coopChannel = new CoopChannel(createSocialRoomTransport(this.coopConnection))
    this.coopUnsubscribe = this.coopChannel.subscribe((message) => this.onCoopMessage(message))
    this.coopConnection.onStatus = (status) => {
      if (!this.coopSession) return
      if (status === 'error') this.showToast('联机战斗连接异常', '#e07a7a')
      else if (status === 'closed') this.showToast('联机战斗连接已断开', '#e07a7a')
    }
    if (!this.coopConnection.isOpen()) this.coopConnection.connect()
  }

  private disposeCoopSync(): void {
    this.coopUnsubscribe?.()
    this.coopUnsubscribe = null
    if (this.coopConnection) this.coopConnection.onStatus = () => {}
    this.coopConnection?.dispose()
    this.coopConnection = null
    this.coopChannel = null
    this.coopSyncState = null
    this.coopReceivedHeroHitIds.clear()
    for (const puppet of this.remoteHeroes.values()) {
      puppet.sprite.destroy()
      puppet.plate.destroy(true)
    }
    this.remoteHeroes.clear()
  }

  private onCoopMessage(message: CoopInboundMessage): void {
    if (!this.coopSession || !this.coopSyncState) return
    const result = applyCoopMessage(this.coopSyncState, message)
    this.coopSyncState = result.state
    for (const outgoing of result.outgoing) this.coopChannel?.send(outgoing)
    if (message.type === 'event' && message.name === 'hit_intent') this.applyRemoteHitIntent(message.payload)
    for (const effect of result.effects) {
      if (effect.type === 'level_event_received' && effect.kind === 'boss_defeated') this.mirrorBossDefeated()
      else if (effect.type === 'hero_hit_received') this.applyRemoteHeroHit(effect.hit)
    }
  }

  private updateCoop(delta: number): void {
    if (!this.coopSession || !this.coopChannel) return
    this.coopHeroBroadcastAccMs += delta
    if (this.coopHeroBroadcastAccMs >= 100) {
      this.coopHeroBroadcastAccMs %= 100
      this.broadcastHeroState()
    }
    this.updateRemoteHeroPuppets()
  }

  private broadcastHeroState(): void {
    if (!this.coopSession || !this.coopChannel) return
    const now = Date.now()
    this.coopChannel.sendHeroState(
      {
        userId: this.coopSession.myUserId,
        heroId: String(HERO_ID),
        x: this.heroState.x,
        y: this.heroState.vertical.y,
        facing: this.heroState.facing,
        action: this.heroState.action,
        level: this.identity.progression.level,
        animState: this.hero.anims.currentAnim?.key ?? this.heroState.action,
        hp: this.identity.combat.hp,
        maxHp: this.identity.combat.maxHp,
        alive: !isHeroDead(this.identity),
      },
      ++this.coopSeq,
      now,
    )
  }

  private updateRemoteHeroPuppets(): void {
    if (!this.coopSession || !this.coopSyncState) return
    for (const [userId, view] of Object.entries(this.coopSyncState.heroes)) {
      if (userId === this.coopSession.myUserId) continue
      const pos = interpolatePosition(view.positionSamples, Date.now())
      if (!pos) continue
      const puppet = this.remoteHeroes.get(userId) ?? this.createRemoteHeroPuppet(userId)
      const action = view.snapshot.alive ? view.snapshot.action : 'hurt'
      if (this.anims.exists(action) && puppet.sprite.anims.currentAnim?.key !== action) puppet.sprite.play(action)
      puppet.sprite.setFlipX(view.snapshot.facing === 1)
      puppet.sprite.setAngle(view.snapshot.alive ? 0 : view.snapshot.facing === 1 ? 90 : -90)
      if (view.snapshot.alive) puppet.sprite.clearTint()
      else puppet.sprite.setTint(0x777777)
      const off = roleData.offset
      const px = pos.x + off.x * HERO_SCALE
      const py = pos.y + off.y * HERO_SCALE
      puppet.sprite.setPosition(px, py)
      puppet.plate.setPosition(px, py - 118)
      const snap = view.snapshot as { hp: number; maxHp: number; level?: number }
      const hpKey = `${snap.hp}/${snap.maxHp}/${snap.level ?? ''}`
      if (puppet.lastHpKey !== hpKey) {
        puppet.lastHpKey = hpKey
        const frac = snap.maxHp > 0 ? Math.max(0, Math.min(1, snap.hp / snap.maxHp)) : 0
        puppet.hpFill.clear()
        puppet.hpFill.fillStyle(0x2f8fe8, 1).fillRoundedRect(-26, -3.5, Math.max(2, 52 * frac), 7, 2)
        puppet.levelText.setText(snap.level !== undefined ? String(snap.level) : '')
      }
    }
  }

  private createRemoteHeroPuppet(userId: string): RemoteHeroPuppet {
    const peer = this.coopSession?.peers.find((candidate) => candidate.userId === userId)
    const sprite = this.add.sprite(0, 0, HERO_TEX).setScale(HERO_SCALE).setDepth(9)
    // 王者荣耀式名牌：上=名字（白字粗描边，清晰可读——旧版淡蓝小字被用户
    // 点名看不清），下=等级金圈 + 蓝血条。
    const name = this.add
      .text(0, -16, peer?.username ?? userId, {
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#10233a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
    const barBg = this.add.graphics()
    barBg.fillStyle(0x0c1622, 0.9).fillRoundedRect(-28, -5.5, 56, 11, 3)
    barBg.lineStyle(1.5, 0xd9b45a, 0.9).strokeRoundedRect(-28, -5.5, 56, 11, 3)
    const hpFill = this.add.graphics()
    const levelRing = this.add.graphics()
    levelRing.fillStyle(0x0c1622, 1).fillCircle(-36, 0, 10)
    levelRing.lineStyle(2, 0xd9b45a, 1).strokeCircle(-36, 0, 10)
    const levelText = this.add
      .text(-36, 0, '', { fontSize: '11px', color: '#ffd23a', fontStyle: 'bold' })
      .setOrigin(0.5)
    const plate = this.add.container(0, 0, [barBg, hpFill, levelRing, levelText, name]).setDepth(20)
    const puppet: RemoteHeroPuppet = { sprite, plate, hpFill, levelText, lastHpKey: '' }
    this.remoteHeroes.set(userId, puppet)
    return puppet
  }

  update(_time: number, delta: number): void {
    if (this.paused) return
    // Accrue play time (whole seconds) for the slot summary.
    this.playtimeAccMs += delta
    if (this.playtimeAccMs >= 1000) {
      const whole = Math.floor(this.playtimeAccMs / 1000)
      this.playtimeSec += whole
      this.playtimeAccMs -= whole * 1000
    }
    this.simClockMs += delta
    tickRole1SkillRuntime(this.skillRuntime, delta)
    // Slow passive MP regen (kagami wires no fixed rate; small value for play
    // feel, TODO-verify — see mp.ts header). maxMp tracks the hero's level.
    tickMpRegen(this.mp, MP_REGEN_PER_SEC, delta)
    this.syncMpMax()
    const edges = this.collectEdges()
    const jumped = edges.pressJump && this.heroState.vertical.grounded
    this.updateHorizontalCameraLock()
    this.heroConfig.maxX = this.currentHeroBounds().maxX
    advanceHero(this.heroState, edges, delta, this.heroConfig)
    if (jumped) this.playSfx('heroJump', 0.4)
    this.spawnHeroSwingEffect()
    this.updateAttachedRole1Effects()

    // Hero melee: push combo damage into every monster the swing overlaps.
    this.resolveHeroHits()
    // Level machine: L1 routes through its substage adapter; L2-L4 keep the
    // existing LevelDef wave/boss/door path.
    if (this.level1Chain) this.updateLevel1(delta)
    else this.updateLevel(delta)
    // Hero combat upkeep: hurt->ready, i-frame expiry, knockback integration,
    // and auto-respawn (in place near the level start, clear of the monster).
    const combatEvents = updateHeroIdentity(
      this.identity,
      this.heroState,
      this.currentHeroBounds(),
      this.simClockMs,
      delta,
      this.level1Chain ? currentSubStage(this.level1Chain).heroStart.x : HERO_START_X,
    )
    for (const e of combatEvents) {
      if (e.type === 'respawn') this.onHeroRespawn()
    }
    this.stepDropsAndPickup()
    this.stepEnemyProjectiles(delta)

    if (this.coopSession) this.updateCoop(delta)
    this.applyHeroRender(this.heroState.action)
    this.renderMonsters()
    this.updateHud()
    this.updateBossHud()
    this.updateParallax()
    this.updateNpcUi()
    this.dialogue.advanceTypewriter()
  }

  private aliveMonsters(): MonsterEntity[] {
    return this.monsters.filter((e) => e.state.mode !== 'dead' && e.state.mode !== 'gone')
  }

  private updateCoopMonsters(delta: number, heroAlive: boolean): void {
    if (!this.coopSession) return
    if (this.coopSession && !this.coopSession.isHost) {
      this.applyRemoteMonsterSnapshots(delta)
      return
    }

    for (const e of this.monsters) this.advanceEntity(e, delta, heroAlive)
    this.coopMonsterBroadcastAccMs += delta
    if (this.coopMonsterBroadcastAccMs >= 100) {
      this.coopMonsterBroadcastAccMs %= 100
      this.broadcastMonsterState(true)
    }
  }

  private broadcastMonsterState(includeRecentlyDead = false): void {
    if (!this.coopSession || !this.coopSession.isHost || !this.coopChannel) return
    const candidates = this.monsters.filter((e) => e.state.mode !== 'gone' && (includeRecentlyDead || e.state.mode !== 'dead'))
    const snapshots = candidates.map((e) => this.monsterSnapshot(e))
    this.coopChannel.sendMonsterState(
      snapshots,
      ++this.coopSeq,
      Date.now(),
      this.currentHeroBounds().maxX,
    )
  }

  private applyRemoteMonsterSnapshots(delta: number): void {
    if (!this.coopSession || !this.coopSyncState) return
    const hostSnapshots = Object.values(this.coopSyncState.monsters).map((view) => view.snapshot)
    const missing = missingHostMonsterSnapshots(new Set(this.coopMonsterById.keys()), hostSnapshots)
    for (const snapshot of missing) {
      const recovered = ACTIVE_MONSTER_STATS[snapshot.species] ?? LEVEL1_MONSTER_STATS.monster30
      const stats = { ...recovered, hp: snapshot.maxHp }
      const entity = this.spawnEntity(
        snapshot.species,
        stats,
        snapshot.x,
        snapshot.isBoss,
        snapshot.y,
        snapshot.monsterId,
      )
      if (snapshot.isBoss) {
        this.bossEntity = entity
        this.levelState.arena.state = 'active'
        this.levelState.arena.boss = entity.state
      } else if (MINIBOSS_SPECIES.has(snapshot.species)) {
        this.activeMiniBoss = entity
      }
    }
    for (const e of this.monsters) {
      const view = this.coopSyncState.monsters[this.coopMonsterId(e)]
      if (!view) continue
      const snapshot = view.snapshot
      const pos = interpolatePosition(view.positionSamples, Date.now())
      if (pos) {
        e.state.x = pos.x
        e.state.y = pos.y
      }
      e.state.facing = snapshot.facing
      e.state.hp = Math.max(0, Math.min(snapshot.maxHp, snapshot.hp))
      if (snapshot.alive) {
        if (e.state.mode === 'dead' || e.state.mode === 'gone') {
          e.state.mode = 'patrol'
          e.state.modeElapsedMs = 0
        }
        e.state.action = snapshot.action
      } else {
        if (e.state.mode !== 'dead' && e.state.mode !== 'gone') {
          e.state.mode = 'dead'
          e.state.modeElapsedMs = 0
        }
        e.state.action = 'dead'
        e.state.modeElapsedMs += delta
        if (e.state.modeElapsedMs >= e.config.deadDurationMs) e.state.mode = 'gone'
      }
    }
  }

  private monsterSnapshot(e: MonsterEntity): MonsterStateSnapshot {
    return {
      monsterId: this.coopMonsterId(e),
      species: e.species,
      isBoss: e.isBoss,
      x: e.state.x,
      y: e.state.y,
      facing: e.state.facing,
      action: e.state.action,
      hp: Math.max(0, e.state.hp),
      maxHp: e.config.stats.hp,
      alive: e.state.mode !== 'dead' && e.state.mode !== 'gone' && e.state.hp > 0,
    }
  }

  private coopMonsterId(e: MonsterEntity): string {
    let id = this.coopMonsterIds.get(e)
    if (!id) {
      id = `${e.species}-${this.coopNextMonsterId++}`
      this.coopMonsterIds.set(e, id)
    }
    this.coopMonsterById.set(id, e)
    return id
  }

  private bindCoopMonsterId(e: MonsterEntity, id: string): void {
    this.coopMonsterIds.set(e, id)
    this.coopMonsterById.set(id, e)
  }

  // hitstun-triad pen: shared coordinate helpers so every hit-test box is
  // centered on the same point renderEntity()/applyHeroRender() actually draw
  // the sprite at, instead of the bare sim `state.x/y` (which is the
  // character's own AS3 registration point, NOT its visual center once the
  // per-species `data.offset` is applied -- see the MON_START_X-adjacent
  // comment above for the BaseBitmapDataClip math this mirrors). Root cause of
  // "棒子打到怪物身体中心了，判定是没打到": every monster hitbox used to be a
  // FIXED 120x140 box centered at bare `state.x/GROUND_Y` regardless of the
  // species' real cell size (90px imp through 350px boss) or its own render
  // offset -- so anything bigger or more offset than "hero-sized" had large
  // chunks of its visible body outside the test box.
  private heroVisualCenter(): { x: number; y: number } {
    const off = roleData.offset
    return { x: this.heroState.x + off.x * HERO_SCALE, y: this.heroState.vertical.y + off.y * HERO_SCALE }
  }

  private monsterVisualCenter(e: MonsterEntity): { x: number; y: number } {
    const off = e.data.offset
    return {
      x: e.state.x + off.x * e.scale,
      y: e.state.y + off.y * e.scale + monsterBaselineCorrectionY(e.species),
    }
  }

  private heroVisibleTopY(): number {
    return computeVisibleTopY({
      stateY: this.heroState.vertical.y,
      offsetY: roleData.offset.y,
      scale: HERO_SCALE,
      cellH: roleData.sheet.cellH,
      contentTop: HERO_IDLE_CONTENT.top,
    })
  }

  private monsterVisibleTopY(e: MonsterEntity): number {
    const content = MONSTER_IDLE_CONTENT[e.species] ?? { top: 0, bottom: e.data.sheet.cellH }
    return computeVisibleTopY({
      stateY: e.state.y,
      offsetY: e.data.offset.y,
      scale: e.scale,
      cellH: e.data.sheet.cellH,
      contentTop: content.top,
      baselineCorrectionY: monsterBaselineCorrectionY(e.species),
    })
  }

  /** Monster hit-test box: same aspect as the original fixed 120x140 (still a
   * project-chosen AABB, not AS3's real per-pixel `colipse` test -- see
   * hitbox.ts's header), but scaled by the species' own cell size relative to
   * the hero's 200x200 reference cell (monster-scale-report.md already
   * established every sprite shares one uniform px->world factor, so cell
   * size directly encodes each species' intended footprint) and centered on
   * its real visual position, not a flat GROUND_Y. */
  private monsterHitbox(e: MonsterEntity): Rect {
    const center = this.monsterVisualCenter(e)
    const w = MONSTER_HITBOX_BASE_W * (e.data.sheet.cellW / HITBOX_REFERENCE_CELL)
    const h = MONSTER_HITBOX_BASE_H * (e.data.sheet.cellH / HITBOX_REFERENCE_CELL)
    return centeredBox(center.x, center.y, w, h)
  }

  /** Push one swing's combo damage into every alive monster its box overlaps
   * (monsterSim dedups by attackId, so a monster is hit at most once per swing).
   * onHit procs + sfx fire once per swing, on the first monster struck.
   *
   * combat-triage pen (2026-07-10): was gated on `s.combo.stage === 0`, but
   * `combo.stage` legitimately stays nonzero through the ENTIRE post-swing
   * grace window (up to graceMs, see combo.ts's header) as pure chain
   * memory -- the swing itself is long over by then. That left this melee
   * box "live" (recomputed fresh every frame at the hero's then-current
   * position) for up to graceMs after every swing, silently damaging
   * anything that wandered in with no visible swing happening -- the root
   * cause of "乌鸦还没被打就死了" for the climb section's fast/fragile
   * (hp=1) Monster30 swarm. `s.attacking` (heroSim.ts) is the correct
   * "genuinely mid-swing" signal (false during the grace window even though
   * `combo.stage` is still nonzero there) -- see its own doc comment. */
  private resolveHeroHits(): void {
    const s = this.heroState
    if (!s.attacking) return
    const heroCenter = this.heroVisualCenter()
    const box = heroAttackBox(heroCenter.x, heroCenter.y, s.facing)
    const hitKey = COMBO_STAGE_HIT[s.combo.stage] ?? 'hit1'
    const atk = heroTotalAtk(this.identity, this.equipment)
    const crit = heroStats(this.identity, this.equipment).crit
    const damage = Math.max(1, Math.round(calculateNormalAttackPower(hitKey, atk, { critChance: crit })))
    let firstHit: MonsterEntity | null = null
    for (const e of this.aliveMonsters()) {
      const mBox = this.monsterHitbox(e)
      if (!overlaps(box, mBox)) continue
      if (e.state.resolvedAttackIds.includes(s.attackId)) continue
      if (e.hitQueue.some((h) => h.attackId === s.attackId)) continue
      if (!this.queueOrSendHeroHit(e, s.attackId, damage)) continue
      const mc = this.monsterVisualCenter(e)
      this.floatText(mc.x, this.monsterVisibleTopY(e) - 14, `${damage}`, 'damage')
      if (!firstHit) firstHit = e
    }
    if (firstHit && !this.playedHitIds.has(s.attackId)) {
      this.playedHitIds.add(s.attackId)
      this.rollHitProcs(firstHit)
      this.onLocalHitFx()
    }
  }

  // ---------- 打击感（2026-07-10 用户拍板：攻击特效 + N连击横幅） ----------

  /** 每次本地攻击真实命中调用：命中震屏 + 连击计数（1.5s 窗口，与
   * combo.ts 的 AS3 链击窗口同源）。刀光在挥击起手生成，挥空也可见。 */
  private comboFxCount = 0
  private comboFxLastMs = 0
  private comboFxBanner?: Phaser.GameObjects.Container
  private comboFxFadeTimer?: Phaser.Time.TimerEvent

  private onLocalHitFx(): void {
    this.cameras.main.shake(70, 0.0022)
    this.comboFxCount = this.simClockMs - this.comboFxLastMs <= 1500 ? this.comboFxCount + 1 : 1
    this.comboFxLastMs = this.simClockMs
    if (this.comboFxCount >= 2) this.showComboBanner(this.comboFxCount)
  }

  private spawnHeroSwingEffect(): void {
    const action = role1AttackEffectForSwing(
      this.lastAttackEffectId,
      this.heroState.attackId,
      this.heroState.combo.stage,
    )
    if (!action) return
    this.lastAttackEffectId = this.heroState.attackId
    this.playSfx(this.hitSfxKey(this.heroState.combo.stage), 0.5)
    const facing = this.heroState.facing as -1 | 1
    const placement = resolveRole1EffectPlacement(
      action,
      { x: this.heroState.x, y: this.heroState.vertical.y },
      facing,
    )
    this.spawnRole1Effect(action, placement.x, placement.y, facing, false, placement)
  }

  /** 连击横幅 v2（2026-07-10 用户打回"人机"版重做，酷优先）：斜切墨条 +
   * 红热底衬 + 金橙渐变大数字（毛笔字"连击"），每次递增重锤入场（超冲缩放
   * + 横向抖动 + 金火花迸射），静默 0.9s 后上滑淡出。 */
  private showComboBanner(count: number): void {
    this.comboFxBanner?.destroy(true)
    this.comboFxFadeTimer?.remove(false)
    const flare = this.add
      .image(-72, 0, role1EffectFrameKey('hit7', 8))
      .setScale(0.42)
      .setAlpha(0.72)
      .setBlendMode(Phaser.BlendModes.ADD)
    const backing = this.add.image(0, 0, COMBO_BANNER_TEX).setDisplaySize(300, 131)
    const num = this.add
      .text(-52, -2, `${count}`, {
        fontSize: '58px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#3a1404',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
    num.setTint(0xffe9a0, 0xffe9a0, 0xff8a1a, 0xff8a1a)
    const label = this.add
      .text(30, 2, '连击', {
        fontSize: '34px',
        fontFamily: activeArtFont().family,
        color: '#ffd23a',
        stroke: '#3a1404',
        strokeThickness: 6,
        padding: { top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
    const bang = this.add
      .text(96, -4, '!!', {
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ff5a2a',
        stroke: '#3a1404',
        strokeThickness: 7,
      })
      .setOrigin(0, 0.5)
    const banner = this.add
      .container(724, 148, [flare, backing, num, label, bang])
      .setScrollFactor(0)
      .setDepth(60)
      .setAngle(-6)
      .setScale(1.7)
      .setAlpha(0.4)
    this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 110, ease: 'Quart.easeIn' })
    this.tweens.add({ targets: banner, x: { from: 732, to: 724 }, delay: 110, duration: 130, ease: 'Bounce.easeOut' })
    for (let i = 0; i < 7; i++) {
      const ang = Math.random() * Math.PI * 2
      const dist = 46 + Math.random() * 42
      const spark = this.add
        .circle(684, 148, 2.2 + Math.random() * 1.8, i % 2 ? 0xffd23a : 0xff7a2a, 1)
        .setScrollFactor(0)
        .setDepth(59)
      this.tweens.add({
        targets: spark,
        x: 684 + Math.cos(ang) * dist,
        y: 148 + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 320 + Math.random() * 140,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      })
    }
    this.comboFxBanner = banner
    this.comboFxFadeTimer = this.time.delayedCall(900, () => {
      this.tweens.add({
        targets: banner,
        alpha: 0,
        y: 132,
        duration: 240,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          if (this.comboFxBanner === banner) this.comboFxBanner = undefined
          banner.destroy(true)
        },
      })
    })
  }

  private spawnRole1Effect(
    action: string,
    x: number,
    y: number,
    facing: number,
    shake = true,
    placement?: { originX: number; originY: number; flipX: boolean },
  ): void {
    const spec = role1EffectForAction(action)
    if (!spec) return
    const effectAction = action as Role1EffectAction
    const sprite = this.add
      .sprite(x, y, role1EffectFrameKey(effectAction, 1))
      .setDepth(15)
      .setScale(spec.scale)
      .setFlipX(placement?.flipX ?? facing >= 0)
    if (placement) sprite.setDisplayOrigin(placement.originX, placement.originY)
    if (placement && spec.followAnchor) {
      this.attachedRole1Effects.set(sprite, { action: effectAction, facing: facing as -1 | 1 })
    }
    const animKey = `role1_fx_anim_${effectAction}`
    sprite.play(animKey)
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.attachedRole1Effects.delete(sprite)
      sprite.destroy()
    })
    this.time.delayedCall(Math.ceil((spec.frames / spec.fps) * 1000) + 200, () => {
      if (sprite.active) {
        this.attachedRole1Effects.delete(sprite)
        sprite.destroy()
      }
    })
    if (shake) this.cameras.main.shake(70, 0.0022)
  }

  private updateAttachedRole1Effects(): void {
    for (const [sprite, attached] of this.attachedRole1Effects) {
      if (!sprite.active) {
        this.attachedRole1Effects.delete(sprite)
        continue
      }
      const placement = resolveRole1EffectPlacement(
        attached.action,
        { x: this.heroState.x, y: this.heroState.vertical.y },
        attached.facing,
      )
      sprite
        .setPosition(placement.x, placement.y)
        .setDisplayOrigin(placement.originX, placement.originY)
        .setFlipX(placement.flipX)
    }
  }

  private updateHorizontalCameraLock(): void {
    if (!this.level1Chain) return
    const stage = currentSubStage(this.level1Chain)
    if (stage.mode !== 'horizontal') return
    const localCenterMax = horizontalProgressMaxX(this.levelState, stage.bounds.right)
    const peerHeroMax = this.coopSession && !this.coopSession.isHost
      ? this.coopSyncState?.hostProgressMaxX
      : undefined
    const cameraCenterMax = peerHeroMax === undefined
      ? localCenterMax
      : Math.min(stage.bounds.right, peerHeroMax - VIEWPORT_W / 2 + HORIZONTAL_HERO_RIGHT_INSET)
    const right = Math.min(stage.bounds.right, Math.max(stage.heroStart.x, cameraCenterMax)) + VIEWPORT_W / 2
    const width = Math.max(VIEWPORT_W, right - stage.bounds.left)
    this.cameras.main.setBounds(stage.bounds.left, 0, width, VIEWPORT_H)
    this.cameras.main.setScroll(this.cameras.main.scrollX, 0)
  }

  private rollHitProcs(target: MonsterEntity): void {
    for (const p of rollOnHitProcs(equippedList(this.equipment), Math.random)) {
      if (p.effect === 'lifesteal') this.applyLifesteal(p.power)
      else if (p.effect === 'burn') target.burn = { ticksLeft: BURN_TICKS, nextAtMs: this.simClockMs, power: p.power }
      else if (p.effect === 'freeze') target.frozenUntilMs = this.simClockMs + FREEZE_MS
    }
  }

  private queueOrSendHeroHit(target: MonsterEntity, attackId: number, damage: number): boolean {
    if (!this.coopSession) {
      target.hitQueue.push({ attackId, damage })
      return true
    }
    if (this.coopSession.isHost) {
      target.hitQueue.push({ attackId, damage })
      return true
    }

    const targetMonsterId = this.coopMonsterId(target)
    const sentKey = `${targetMonsterId}:${attackId}`
    if (this.coopSentHitIntents.has(sentKey)) return false
    const sent = !!this.coopChannel?.sendHitIntent({
      attackerUserId: this.coopSession.myUserId,
      targetMonsterId,
      attackId: String(attackId),
      damage,
      clientTimeMs: Date.now(),
    })
    if (sent) this.coopSentHitIntents.add(sentKey)
    return sent
  }

  private applyRemoteHitIntent(intent: HitIntentPayload): void {
    if (!this.coopSession || !this.coopSession.isHost) return
    if (intent.attackerUserId === this.coopSession.myUserId) return
    const target = this.coopMonsterById.get(intent.targetMonsterId)
    if (!target || target.state.mode === 'dead' || target.state.mode === 'gone') return
    const attackId = this.remoteAttackId(intent)
    if (target.state.resolvedAttackIds.includes(attackId)) return
    if (target.hitQueue.some((hit) => hit.attackId === attackId)) return
    target.hitQueue.push({ attackId, damage: intent.damage })
    this.floatText(this.monsterVisualCenter(target).x, this.monsterVisibleTopY(target) - 14, `${intent.damage}`, 'damage')
  }

  private remoteAttackId(intent: HitIntentPayload): number {
    const key = `${intent.attackerUserId}:${intent.attackId}`
    const existing = this.coopRemoteAttackIds.get(key)
    if (existing !== undefined) return existing
    const next = ++this.coopRemoteAttackIdSeq
    this.coopRemoteAttackIds.set(key, next)
    return next
  }

  // ---------- level tick ----------

  private updateLevel(delta: number): void {
    const heroAlive = !isHeroDead(this.identity)
    const runsAuthority = !this.coopSession || this.coopSession.isHost
    // Spawn the next wave when the machine says so.
    if (runsAuthority && updateLevelSpawn(this.levelState, this.aliveGruntCount() + this.pendingWaveSpawns.length)) {
      this.spawnActiveWave()
    }
    if (runsAuthority) this.drainPendingWaveSpawns(delta)
    // All stops cleared -> spawn the arena boss (once).
    if (runsAuthority && isBossZoneTriggered(this.levelState)) {
      markBossTriggered(this.levelState)
      this.spawnBoss()
    }
    if (!this.coopSession) for (const e of this.monsters) this.advanceEntity(e, delta, heroAlive)
    else this.updateCoopMonsters(delta, heroAlive)
    this.reapMonsters()
    // Boss down -> stage-clear banner, then the portal on confirm/timeout. The
    // door is revealed now (so the portal is reachable the moment the banner is
    // dismissed and __usePortal keeps working), but its glow only shows on
    // dismiss.
    if (runsAuthority && this.bossEntity && isBossDead(this.bossEntity.state) && !this.levelState.arena.door.visible) {
      revealTransferDoor(this.levelState)
      this.showResultBanner()
    }
  }

  /** Boss cleared: play the 挑战成功 banner with a short stat line, then hand
   * off to the portal on 继续 / timeout. */
  private showResultBanner(): void {
    if (this.coopSession?.isHost) this.broadcastBossDefeated()
    const bossName = this.bossEntity ? MONSTER_NAMES[this.bossEntity.species] ?? '妖王' : '妖王'
    this.resultBanner.showSuccess({
      stats: [
        this.currentCampaignName(),
        `${bossName}已除`,
        `境界 Lv${this.identity.progression.level}`,
      ],
    })
    this.playSfx('pickup', 0.7)
    this.bannerTimer?.remove(false)
    this.bannerTimer = this.time.delayedCall(6000, () => this.dismissResultBanner())
  }

  private broadcastBossDefeated(): void {
    if (!this.coopSession || !this.coopSession.isHost || !this.coopChannel || this.coopBossDefeatedSent) return
    this.coopBossDefeatedSent = true
    this.coopChannel.send(encodeLevelEvent({ kind: 'boss_defeated' }))
  }

  private mirrorBossDefeated(): void {
    if (!this.coopSession || this.coopSession.isHost) return
    if (this.level1Chain) {
      const door = currentSubStageDoor(this.level1Chain)
      if (!door.visible) markCurrentSubStageCleared(this.level1Chain)
    } else if (!this.levelState.arena.door.visible) {
      revealTransferDoor(this.levelState)
    }
    if (!this.resultBanner.isOpen) this.showResultBanner()
  }

  /** Close the result banner and reveal the transfer portal glow. */
  private dismissResultBanner(): void {
    if (!this.resultBanner.isOpen) return
    this.bannerTimer?.remove(false)
    this.bannerTimer = undefined
    this.resultBanner.hide()
    this.showPortal()
  }

  private advanceEntity(e: MonsterEntity, delta: number, heroAlive: boolean): void {
    if (e.state.mode === 'gone') return

    // behavior-wiring pen: Monster3's hit2 (or any future MONSTER_SKILL_GATES
    // entry) runs as a side overlay on this entity's own monsterSim state
    // machine -- see monsterBehaviors.ts's "Skill overlay" section header for
    // why it isn't a full switch to advanceMonsterBehavior. `canTrigger` only
    // while 'chase' (an acquired target, not already mid its own hit1/hurt)
    // mirrors 巫鹰's real beforeSkill1Start() requiring a curAttackTarget.
    if (e.skillGate && e.skillOverlay && e.state.mode !== 'dead') {
      const xDist = Math.abs(this.heroState.x - e.state.x)
      const canTrigger = e.state.mode === 'chase' && !e.skillOverlay.active
      // hitstun-triad pen (blue-team catch, tasks/review-blue-findings.md):
      // was `{x: e.state.x, y: e.state.y, ...}` (the boss's raw sim anchor) --
      // that left this the ONE hit-test box in the file still built in a
      // different coordinate space than the hero hurtbox it's tested against
      // (heroVisualCenter(), see resolveEnemySkillHit), a mismatch of exactly
      // the boss's own render offset (Monster3: off.y=-5, scale=1.5 -> 7.5px;
      // hero's own off.y=-15 -> 22.5px is the bigger half of the gap). Ruling
      // (see monsterHitbox()'s header for the same call made on the
      // hero-attacks-monster side): this project has no extracted per-pixel
      // `colipse` art to anchor hit-tests on, so every AABB test box in this
      // file is defined to live in RENDERED VISUAL CENTER space -- what the
      // player actually sees overlapping. The AS3-sourced per-move offsetX/Y
      // constants (Monster3's -60/-30, Monster7's -86, Monster13's -21, all
      // from doHi*()'s literal `this.y - N`) still apply on top of that
      // center exactly as decompiled; they shift by the character's own
      // small render offset (a few px) relative to their literal AS3 meaning
      // (offset from the raw un-rendered registration point), which is
      // negligible next to the tens-of-px misalignment this fixes.
      const skillEvents = advanceSkillOverlay(
        e.skillOverlay,
        e.skillGate,
        { ...this.monsterVisualCenter(e), facing: e.state.facing },
        xDist,
        canTrigger,
        delta,
      )
      for (const ev of skillEvents) {
        if (ev.type === 'attack-spawn' && ev.spawn) this.resolveEnemySkillHit(e, ev.spawn)
      }
      if (e.skillOverlay.active) {
        // Mid-cast: force the special-move animation and hold position for
        // the swing's duration -- skip this frame's own advanceMonster tick
        // entirely (same reasoning monsterSim's own 'attack' mode already
        // holds position; see report for the deferred-hitQueue tradeoff this
        // implies while a cast is in flight).
        e.state.action = e.skillGate.move.actionName
        return
      }
    }

    // Burn tick -> queue as an incoming hit (monsterSim resolves it normally).
    if (e.state.mode !== 'dead' && e.burn && this.simClockMs >= e.burn.nextAtMs) {
      e.hitQueue.push({ attackId: ++this.burnAttackId, damage: e.burn.power })
      this.floatText(this.monsterVisualCenter(e).x, this.monsterVisibleTopY(e) - 10, `${e.burn.power}`, 'burn')
      e.burn.ticksLeft -= 1
      e.burn.nextAtMs = this.simClockMs + BURN_INTERVAL_MS
      if (e.burn.ticksLeft <= 0) e.burn = null
    }
    const frozen = this.simClockMs < e.frozenUntilMs
    const incomingHit = e.hitQueue.shift() ?? null
    const target = this.selectMonsterTarget(e, heroAlive)
    const events = advanceMonster(
      e.state,
      { heroX: target.x, heroY: target.y, heroAlive: target.alive, incomingHit },
      frozen ? delta * 0.15 : delta,
      e.config,
    )
    for (const ev of events) {
      if (ev.type === 'hurt') this.playSfx('monHurt', 0.6)
      else if (ev.type === 'attack-frame') this.resolveMonsterAttackFrame(e, ev.attackFrameIndex ?? 0)
      else if (ev.type === 'projectile-spawn') this.spawnMonsterProjectile(e, ev)
      else if (ev.type === 'death') {
        this.spawnDrops(ev.x, ev.y, e.species)
        this.npcClient.worldEvent('monster_killed', { monster: MONSTER_NAMES[e.species] ?? e.species })
        this.awardKillExp(ev.x, ev.y, e.species)
      }
    }
  }

  private selectMonsterTarget(e: MonsterEntity, localAlive: boolean): AliveHeroTarget {
    const local: AliveHeroTarget = {
      userId: this.coopSession?.myUserId ?? '__local__',
      x: this.heroState.x,
      y: this.heroState.vertical.y,
      alive: localAlive,
    }
    if (!this.coopSession?.isHost || !this.coopSyncState) return local
    const remotes = Object.values(this.coopSyncState.heroes)
      .map((view) => view.snapshot)
      .filter((snapshot) => snapshot.userId !== this.coopSession?.myUserId)
    return selectNearestAliveHeroTarget({ x: e.state.x, y: e.state.y }, local, remotes) ?? local
  }

  /** A skill hitbox (Monster3's hit2) reached its spawnAtMs -- test it against
   * a real 2D hero hurtbox (unlike monsterSim's own x-distance-only melee
   * reach) so the player can genuinely dodge by not standing in the AoE at
   * the right instant, then route through the same mitigation/i-frame path
   * as a normal hit, just with this move's own power/kind instead of the
   * entity's hit1 attackPower/attackKind. */
  private resolveEnemySkillHit(e: MonsterEntity, spawn: SpawnedHitbox): void {
    const spec = monsterAttackSpecFor(e.species, spawn.actionName)
    const hitbox = spec
      ? resolveAttackSpec(spec, this.monsterVisualCenter(e), e.state.facing).hitbox
      : spawnedHitboxToRect(spawn)
    if (!isHeroDead(this.identity) && overlaps(hitbox, this.currentHeroHurtbox())) {
      this.monsterHitsHero(e, spawn.damage, spawn.attackKind)
    }
    this.sendRemoteHeroHits(e, hitbox, spawn.damage, spawn.attackKind)
  }

  private currentHeroHurtbox(): Rect {
    const center = this.heroVisualCenter()
    return centeredBox(center.x, center.y, HERO_HURTBOX_W, HERO_HURTBOX_H)
  }

  private resolveMonsterAttackFrame(e: MonsterEntity, attackFrameIndex: number): void {
    // Monster30's frame launches a projectile; its moving bullet owns damage.
    if (e.config.rangedAttack) return
    const spec = e.config.attackSpec
    if (!spec) return
    const visual = monsterHit1VisualForAttackFrame(e.species, attackFrameIndex)
    const resolved = resolveAttackSpec(
      visual ? { ...spec, effect: visual.effect } : spec,
      this.monsterVisualCenter(e),
      e.state.facing,
    )
    if (visual && resolved.effect) this.spawnMonsterHit1Effect(visual.phase, resolved.effect)
    if (overlaps(resolved.hitbox, this.currentHeroHurtbox())) this.monsterHitsHero(e)
    this.sendRemoteHeroHits(e, resolved.hitbox, e.attackPower, e.attackKind)
  }

  private spawnMonsterHit1Effect(
    phase: MonsterHit1EffectPhase,
    resolved: { x: number; y: number; originX: number; originY: number; flipX: boolean },
  ): void {
    const sprite = this.add
      .sprite(resolved.x, resolved.y, monsterHit1EffectFrameKey(phase, 1))
      .setDisplayOrigin(resolved.originX, resolved.originY)
      .setFlipX(resolved.flipX)
      .setDepth(12)
    sprite.play(monsterHit1EffectAnimationKey(phase))
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy())
    this.time.delayedCall(Math.ceil((phase.timelineFrames / phase.fps) * 1000) + 100, () => {
      if (sprite.active) sprite.destroy()
    })
  }

  private sendRemoteHeroHits(
    e: MonsterEntity,
    hitbox: Rect,
    power: number,
    attackKind: AttackKind,
  ): void {
    if (!this.coopSession?.isHost || !this.coopSyncState || !this.coopChannel) return
    const monsterCenter = this.monsterVisualCenter(e)
    const targets = selectRemoteHeroHitTargets(
      hitbox,
      monsterCenter.x,
      Object.values(this.coopSyncState.heroes).map((view) => view.snapshot),
      this.coopSession.myUserId,
      {
        offset: roleData.offset,
        scale: HERO_SCALE,
        hurtboxWidth: HERO_HURTBOX_W,
        hurtboxHeight: HERO_HURTBOX_H,
      },
    )
    const sourceMonsterId = this.coopMonsterId(e)
    for (const target of targets) {
      const attackId = `${sourceMonsterId}:${++e.attackId}`
      this.coopChannel.sendHeroHit({
        targetUserId: target.targetUserId,
        sourceMonsterId,
        attackId,
        power,
        attackKind,
        knockbackX: target.knockbackX,
      })
    }
  }

  private applyRemoteHeroHit(payload: HeroHitPayload): void {
    if (!this.coopSession) return
    if (this.coopSession.isHost) return
    if (payload.targetUserId !== this.coopSession.myUserId) return
    if (this.coopReceivedHeroHitIds.has(payload.attackId)) return
    this.coopReceivedHeroHitIds.add(payload.attackId)

    const mitigated = resolveCoopHeroHitDamage(
      payload,
      heroTotalDef(this.identity, this.equipment),
      heroMagicDef(this.identity),
    )
    const hit: HeroHit = {
      sourceId: payload.sourceMonsterId,
      attackId: ++this.coopReceivedHeroAttackIdSeq,
      damage: mitigated,
      knockbackX: payload.knockbackX,
    }
    const events = damageHero(this.identity, hit, this.simClockMs)
    for (const event of events) {
      if (event.type === 'hurt') {
        this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 12, `${mitigated}`, 'hurt')
        this.hero.setTint(0xff9a9a)
        this.time.delayedCall(120, () => {
          if (!isHeroDead(this.identity)) this.hero.clearTint()
        })
      } else if (event.type === 'death') {
        this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 12, `${mitigated}`, 'hurt')
        this.showToast('悟空倒地…　Esc 可回主菜单', '#ff6b6b')
      }
    }
  }

  private reapMonsters(): void {
    for (const e of this.monsters) {
      if (e.state.mode === 'gone' && e !== this.bossEntity) {
        e.hpBar?.destroy()
        e.sprite.destroy()
      }
    }
    this.monsters = this.monsters.filter((e) => e.state.mode !== 'gone' || e === this.bossEntity)
  }

  private spawnBoss(): void {
    const def = CAMPAIGN[this.campaignIndex] as LevelDef
    const boss = this.spawnEntity(def.boss.species, def.boss.stats, MON_START_X, true)
    this.bossEntity = boss
    this.levelState.arena.state = 'active'
    this.levelState.arena.boss = boss.state
    this.showToast(`BOSS · ${def.boss.label}`, '#ff9a5a')
  }

  private applyLifesteal(power: number): void {
    const c = this.identity.combat
    const before = c.hp
    c.hp = Math.min(c.maxHp, c.hp + power)
    const healed = c.hp - before
    this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 10, `+${healed || power}`, 'heal')
    this.hero.setTint(0xd6ffd6)
    this.time.delayedCall(120, () => this.hero.clearTint())
  }

  private hitSfxKey(stage: number): string {
    if (stage <= 2) return 'hit12'
    if (stage <= 4) return 'hit34'
    return 'hit5'
  }

  // Kill reward: feed the exp through the identity host so a level-up grows the
  // hero's stats. 2026-07-10 拍板：不再飘 +EXP 数字（玩家看左上黄条），仅
  // 升级时给 toast + LEVEL UP。
  private awardKillExp(_x: number, _y: number, species: string): void {
    const heroLevels = [
      this.identity.progression.level,
      ...Object.values(this.coopSyncState?.heroes ?? {}).flatMap((view) =>
        typeof view.snapshot.level === 'number' ? [view.snapshot.level] : [],
      ),
    ]
    const result = gainHeroExp(
      this.identity,
      monsterExp(species, { heroLevel: this.identity.progression.level, heroLevels }),
    )
    if (result.levelsGained > 0) {
      this.showToast(`升级！ Lv.${result.levelAfter}`, '#ffe066')
      this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 10, 'LEVEL UP!', 'exp')
      this.hero.setTint(0xfff2a8)
      this.time.delayedCall(220, () => {
        if (!isHeroDead(this.identity)) this.hero.clearTint()
      })
    }
    this.saveToSlot() // autosave: exp/level changed
  }

  // A monster swing lands: route its raw attack power through the original
  // two-way defense formula (heroScale.resolveIncomingHeroDamage; heroCombat
  // applies none itself), then into the combat model (i-frames/death/respawn).
  // Normal attacks reach this only after resolveMonsterAttackFrame intersects
  // their shared AttackSpec with the hero's current two-dimensional hurtbox.
  // `overridePower`/`overrideKind` (behavior-wiring pen): a skill overlay hit
  // (Monster3's hit2, real AS3 magic power 7) has different power/kind than
  // this entity's own hit1 attackPower/attackKind -- resolveEnemySkillHit
  // already did its own real-hitbox dodge check before calling this, so both
  // paths still funnel through the same mitigation/i-frame/knockback logic.
  private monsterHitsHero(e: MonsterEntity, overridePower?: number, overrideKind?: AttackKind): void {
    if (isHeroDead(this.identity)) return
    if (isHeroInvincible(this.identity, this.simClockMs)) return
    const mitigated = Math.max(
      1,
      Math.round(
        resolveIncomingHeroDamage(
          overridePower ?? e.attackPower,
          overrideKind ?? e.attackKind,
          heroTotalDef(this.identity, this.equipment),
          heroMagicDef(this.identity),
        ),
      ),
    )
    const knockbackX = this.heroState.x < e.state.x ? -1 : 1
    const hit: HeroHit = {
      sourceId: this.coopMonsterId(e),
      attackId: ++e.attackId,
      damage: mitigated,
      knockbackX,
    }
    const events = damageHero(this.identity, hit, this.simClockMs)
    for (const e of events) {
      if (e.type === 'hurt') {
        this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 12, `${mitigated}`, 'hurt')
        this.hero.setTint(0xff9a9a)
        this.time.delayedCall(120, () => {
          if (!isHeroDead(this.identity)) this.hero.clearTint()
        })
      } else if (e.type === 'death') {
        this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 12, `${mitigated}`, 'hurt')
        this.showToast('悟空倒地…　Esc 可回主菜单', '#ff6b6b')
      }
    }
  }

  private spawnMonsterProjectile(e: MonsterEntity, ev: Extract<MonsterEvent, { type: 'projectile-spawn' }>): void {
    const projectile = spawnEnemyProjectile({
      id: this.nextEnemyProjectileId++,
      kind: ev.projectile.kind,
      sourceId: this.coopMonsterId(e),
      attackId: ++e.attackId,
      x: ev.x,
      y: ev.y,
      targetX: ev.targetX,
      targetY: ev.targetY,
      facing: ev.facing,
      speedPxPerSecond: ev.projectile.speedPxPerSecond,
      radius: ev.projectile.radius,
      ttlMs: ev.projectile.ttlMs,
      damage: e.attackPower,
      attackKind: e.attackKind,
    })
    this.enemyProjectiles.push(projectile)
    this.enemyProjectileSprites.set(projectile, this.makeEnemyProjectileSprite(projectile))
  }

  private makeEnemyProjectileSprite(projectile: EnemyProjectile): Phaser.GameObjects.Container {
    const visual = monsterHit1VisualForAttackFrame('monster30', 0)
    if (!visual) return this.add.container(projectile.x, projectile.y).setDepth(8)
    const facing = projectile.vx >= 0 ? 1 : -1
    const spec = monsterAttackSpecFor('monster30', 'hit1')
    const resolved = spec
      ? resolveAttackSpec({ ...spec, effect: visual.effect }, { x: 0, y: 0 }, facing).effect
      : undefined
    if (!resolved) return this.add.container(projectile.x, projectile.y).setDepth(8)
    const sprite = this.add
      .sprite(resolved.x, resolved.y, monsterHit1EffectFrameKey(visual.phase, 1))
      .setDisplayOrigin(resolved.originX, resolved.originY)
      .setFlipX(resolved.flipX)
    sprite.play(monsterHit1EffectAnimationKey(visual.phase))
    return this.add.container(projectile.x, projectile.y, [sprite]).setDepth(8)
  }

  private stepEnemyProjectiles(delta: number): void {
    const { remaining, hits } = stepEnemyProjectilesAgainstTargets(
      this.enemyProjectiles,
      this.enemyProjectileTargets(),
      delta,
    )
    for (const p of this.enemyProjectiles) {
      if (!remaining.includes(p)) {
        this.enemyProjectileSprites.get(p)?.destroy()
        this.enemyProjectileSprites.delete(p)
      }
    }
    this.enemyProjectiles = remaining
    for (const p of this.enemyProjectiles) this.enemyProjectileSprites.get(p)?.setPosition(p.x, p.y)
    for (const hit of hits) this.enemyProjectileHitsHero(hit)
  }

  private enemyProjectileTargets(): EnemyProjectileTarget[] {
    const heroCenter = this.heroVisualCenter()
    const targets: EnemyProjectileTarget[] = [{
      targetId: this.coopSession?.myUserId ?? '__local__',
      x: heroCenter.x,
      y: heroCenter.y,
      alive: !isHeroDead(this.identity),
    }]
    if (!this.coopSession?.isHost || !this.coopSyncState) return targets
    for (const view of Object.values(this.coopSyncState.heroes)) {
      const snapshot = view.snapshot
      if (snapshot.userId === this.coopSession.myUserId) continue
      targets.push({
        targetId: snapshot.userId,
        x: snapshot.x + roleData.offset.x * HERO_SCALE,
        y: snapshot.y + roleData.offset.y * HERO_SCALE,
        alive: snapshot.alive,
      })
    }
    return targets
  }

  private enemyProjectileHitsHero(hit: EnemyProjectileHit): void {
    if (this.coopSession?.isHost && hit.targetId !== this.coopSession?.myUserId) {
      this.sendRemoteHeroProjectileHit(hit)
      return
    }
    if (isHeroDead(this.identity)) return
    if (isHeroInvincible(this.identity, this.simClockMs)) return
    const mitigated = Math.max(
      1,
      Math.round(
        resolveIncomingHeroDamage(
          hit.damage,
          hit.attackKind,
          heroTotalDef(this.identity, this.equipment),
          heroMagicDef(this.identity),
        ),
      ),
    )
    const knockbackX = this.heroState.x < hit.x ? -1 : 1
    const heroHit: HeroHit = {
      sourceId: hit.sourceId,
      attackId: hit.attackId,
      damage: mitigated,
      knockbackX,
    }
    const events = damageHero(this.identity, heroHit, this.simClockMs)
    for (const e of events) {
      if (e.type === 'hurt') {
        this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 12, `${mitigated}`, 'hurt')
        this.hero.setTint(0xff9a9a)
        this.time.delayedCall(120, () => {
          if (!isHeroDead(this.identity)) this.hero.clearTint()
        })
      } else if (e.type === 'death') {
        this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 12, `${mitigated}`, 'hurt')
        this.showToast('悟空倒地…　Esc 可回主菜单', '#ff6b6b')
      }
    }
  }

  private sendRemoteHeroProjectileHit(hit: EnemyProjectileHit): void {
    if (!this.coopSession?.isHost || !this.coopSyncState || !this.coopChannel || !hit.targetId) return
    const target = this.coopSyncState.heroes[hit.targetId]?.snapshot
    if (!target?.alive) return
    this.coopChannel.sendHeroHit({
      targetUserId: hit.targetId,
      sourceMonsterId: hit.sourceId,
      attackId: `${hit.sourceId}:${hit.attackId}`,
      power: hit.damage,
      attackKind: hit.attackKind,
      knockbackX: target.x < hit.x ? -1 : 1,
    })
  }

  private onHeroRespawn(): void {
    this.hero.clearTint()
    this.hero.setAlpha(1)
    this.hero.setAngle(0)
    this.showToast('复活！', '#6ef0a0')
    this.floatText(this.heroVisualCenter().x, this.heroVisibleTopY() - 10, '复活', 'heal')
    this.hero.setTint(0xd6ffd6)
    this.time.delayedCall(200, () => this.hero.clearTint())
  }

  /** Rising floating text, styled per FLOAT_STYLES (ui/hud/Toast). */
  private floatText(x: number, y: number, text: string, kind: FloatKind = 'damage'): void {
    const combatNumber = kind === 'damage' || kind === 'crit' || kind === 'burn' || kind === 'hurt'
    const position = combatNumber ? this.floatingTextLanes.allocate(x, y, this.simClockMs) : { x, y }
    spawnFloatingText(this, position.x, position.y, text, kind)
  }

  // l1-truth pen (2026-07-09): was hardcoded 'monster30' regardless of which
  // species actually died -- every kill in the game (巫鹰/千里眼/巨灵神/...)
  // rolled the swarm-imp drop table (妖怪残魂/白银矿石/大还丹) and each
  // species' own configured table in drops.json (e.g. monster5's 玄铁碎片/
  // 踏云靴) could never drop. Now takes the real killer's species.
  private spawnDrops(x: number, y: number, species: string): void {
    const context = this.dropRollContext()
    const medicineDrop = rollMedicineDrop(Math.random)
    if (medicineDrop) {
      const drop = spawnConsumableDrop(medicineDrop, x, y)
      this.drops.push(drop)
      this.dropSprites.set(drop, this.makeDropSprite(drop))
    }
    const soulDrop = spawnSoulDrop(monsterSoulDropAmount(species, context), x, y)
    if (soulDrop.amount > 0) {
      this.drops.push(soulDrop)
      this.dropSprites.set(soulDrop, this.makeDropSprite(soulDrop))
    }
    for (const { item, qty } of rollDrops(species, Math.random, context)) {
      const drop = spawnDrop(item, qty, x, y)
      this.drops.push(drop)
      this.dropSprites.set(drop, this.makeDropSprite(drop))
    }
    l1StarterRewards(species, context).forEach(({ item, qty }, index) => {
      const drop = spawnDrop(item, qty, x + (index - 1) * 34, y)
      this.drops.push(drop)
      this.dropSprites.set(drop, this.makeDropSprite(drop))
    })
  }

  private dropRollContext(): DropRollContext {
    if (this.campaignIndex === 0) return { stage: 1, level: 1 }
    if (this.campaignIndex === 1) return { stage: 1, level: 2 }
    return { stage: this.campaignIndex + 1, level: 1 }
  }

  // Item drops use the original-style cue: larger bare icon plus rarity-colored
  // floating name text. No opaque backing, rarity ring, or nearby blue frame.
  private makeDropSprite(drop: DropEntity): Phaser.GameObjects.Container {
    if (drop.kind === 'soul') {
      // 原版语义（用户 2026-07-09 拍板）：小紫球，自己飘进人物（homing 在
      // systems/pickup.ts 的 soul 分支），无文字标签——数值反馈走吸收时的
      // floatText。红色大球版被用户红框点名，弃。
      const halo = this.add.circle(0, 0, 8, 0x9b59d0, 0.28)
      const orb = this.add.circle(0, 0, 5, 0x8e4fd0, 0.95).setStrokeStyle(1.5, 0xd8b4ff, 0.9)
      const shine = this.add.circle(-1.5, -1.5, 1.6, 0xf4e8ff, 0.9)
      return this.add.container(drop.x, drop.y, [halo, orb, shine]).setDepth(8)
    }
    // 2026-07-10 用户拍板：掉落物不加文字标签，只留物本体（药珠/图标）。
    if (drop.kind === 'consumable') {
      const icon = this.add.image(0, 0, consumableTextureKey(drop.consumableId))
      const maxSize = drop.consumableId === 'bigHp' ? 40 : 34
      icon.setScale(Math.min(1, maxSize / Math.max(icon.width, icon.height)))
      return this.add.container(drop.x, drop.y, [icon]).setDepth(8)
    }
    const visual = dropItemVisualSpec(drop.item.rarity)
    const dropIconKey = 'drop_icon_' + drop.item.id
    const iconKey = this.textures.exists(dropIconKey)
      ? dropIconKey
      : this.textures.exists('icon_' + drop.item.id)
        ? 'icon_' + drop.item.id
        : ICON_FALLBACK_KEY
    const icon = this.add.image(0, 0, iconKey)
    icon.setScale(Math.min(1, visual.iconMaxSize / Math.max(icon.width, icon.height)))
    return this.add.container(drop.x, drop.y, [icon]).setDepth(8)
  }

  private stepDropsAndPickup(): void {
    const heroCenter = this.heroVisualCenter()
    const previousDrops = this.drops
    const { remaining, picked } = stepDrops(previousDrops, this.heroState.x, heroCenter.y, this.pickupCfg)
    const pickedEntities = previousDrops.filter((drop) => !remaining.includes(drop))
    this.drops = remaining
    let stateChanged = false
    if (picked.length > 0) {
      for (let index = 0; index < picked.length; index += 1) {
        const pickedDrop = picked[index]
        const sourceDrop = pickedEntities[index]
        let fullyCollected = true
        if (pickedDrop.kind === 'soul') {
          addSoul(this.soulPurse, pickedDrop.amount)
          this.npcClient.worldEvent('soul_obtained', { amount: pickedDrop.amount })
          stateChanged = true
        } else if (pickedDrop.kind === 'consumable') {
          const result = collectWorldPickup(
            pickedDrop.consumableId,
            { current: this.identity.combat.hp, max: this.identity.combat.maxHp },
            { current: this.mp.mp, max: this.mp.maxMp },
            false,
          )
          if (result.resource === 'hp' && result.hpAfter !== undefined) {
            const delta = result.hpAfter - (result.hpBefore ?? this.identity.combat.hp)
            this.identity.combat.hp = result.hpAfter
            if (delta > 0) this.floatText(heroCenter.x, this.heroVisibleTopY() - 10, `+${Math.round(delta)}`, 'heal')
          } else if (result.resource === 'mp' && result.mpAfter !== undefined) {
            const delta = result.mpAfter - (result.mpBefore ?? this.mp.mp)
            this.mp.mp = result.mpAfter
            if (delta > 0) this.floatText(heroCenter.x, this.heroVisibleTopY() - 10, `+${Math.round(delta)} MP`, 'heal')
          }
          this.npcClient.worldEvent('consumable_obtained', {
            id: pickedDrop.consumableId,
            resource: result.resource,
            amountRequested: Math.round(result.amountRequested),
          })
          stateChanged = true
        } else {
          const added = addItem(this.inventory, pickedDrop.item, pickedDrop.qty)
          const acceptedQty = pickedDrop.qty - added.overflow
          if (acceptedQty > 0) {
            this.npcClient.worldEvent('item_obtained', { item: pickedDrop.item.name, qty: acceptedQty })
            stateChanged = true
          }
          if (
            added.overflow > 0 &&
            sourceDrop &&
            sourceDrop.kind !== 'soul' &&
            sourceDrop.kind !== 'consumable'
          ) {
            sourceDrop.qty = added.overflow
            this.drops.push(sourceDrop)
            fullyCollected = false
            if (this.time.now - this.lastBagFullToastAtMs >= 1000) {
              this.lastBagFullToastAtMs = this.time.now
              this.showToast('背包已满，物品留在地上', '#ff8a6b')
            }
          }
        }
        if (fullyCollected && sourceDrop) {
          this.dropSprites.get(sourceDrop)?.destroy()
          this.dropSprites.delete(sourceDrop)
        }
      }
    }
    // 掉落物贴可视地面（+STAND_SINK-半径余量），别悬在逻辑线上。
    for (const d of this.drops) {
      this.dropSprites.get(d)?.setPosition(d.x, d.y + (d.kind === 'soul' ? 0 : STAND_SINK - 14))
    }
    if (stateChanged) {
      this.playSfx('pickup', 0.7)
      this.saveToSlot()
    }
  }

  private collectEdges(): HeroEdges {
    // Block input while a dialogue is up, the hero is dead, or a skill's shared
    // busy-lock is active (the latter enforces the skill<->combo exclusion).
    if (this.dialogue.isOpen || isHeroDead(this.identity) || this.skillRuntime.cooldownMs > 0) {
      this.injected = { ...NO_EDGES }
      return { ...NO_EDGES }
    }
    const k = this.keys
    const edges: HeroEdges = {
      pressLeft: Phaser.Input.Keyboard.JustDown(k.a) || this.injected.pressLeft,
      releaseLeft: Phaser.Input.Keyboard.JustUp(k.a) || this.injected.releaseLeft,
      pressRight: Phaser.Input.Keyboard.JustDown(k.d) || this.injected.pressRight,
      releaseRight: Phaser.Input.Keyboard.JustUp(k.d) || this.injected.releaseRight,
      pressJump: Phaser.Input.Keyboard.JustDown(k.k) || this.injected.pressJump,
      pressAttack: Phaser.Input.Keyboard.JustDown(k.j) || this.injected.pressAttack,
    }
    this.injected = { ...NO_EDGES }
    return edges
  }

  private applyHeroRender(action: string): void {
    const dead = isHeroDead(this.identity)
    if (dead) {
      // 倒地: no dedicated death frame on role1, so hold the hurt pose, tip the
      // sprite over and gray it out. Re-applied every frame so transient tints
      // (hurt/heal delayedCalls) can't clear it before respawn.
      if (this.hero.anims.currentAnim?.key !== 'hurt') this.hero.play('hurt')
      this.hero.setAngle(this.heroState.facing === 1 ? 90 : -90)
      this.hero.setAlpha(1)
      this.hero.setTint(0x777777)
    } else {
      // A skill cast holds its pose for the busy-lock duration, overriding the
      // heroSim action underneath.
      if (this.skillAnim && this.simClockMs >= this.skillAnim.untilMs) this.skillAnim = null
      const effective = this.skillAnim ? this.skillAnim.action : action
      if (this.hero.anims.currentAnim?.key !== effective) this.hero.play(effective)
      this.hero.setAngle(0)
      // Flicker while the per-hit / meter i-frames are up (clear read that the
      // hero is briefly untargetable after a hit).
      const flicker =
        isHeroInvincible(this.identity, this.simClockMs) && Math.floor(this.simClockMs / 90) % 2 === 0
      this.hero.setAlpha(flicker ? 0.4 : 1)
    }
    this.hero.setFlipX(this.heroState.facing === 1)
    const off = roleData.offset
    const px = this.heroState.x + off.x * HERO_SCALE
    const py = this.heroState.vertical.y + off.y * HERO_SCALE
    this.hero.setPosition(px, py)
    const weaponShowId = this.equipment.weapon ? weaponShowIdForItem(this.equipment.weapon) : null
    const weaponTexture = weaponShowId === null ? null : `role1_equip${weaponShowId}`
    const weaponVisible = weaponTexture !== null && this.textures.exists(weaponTexture)
    this.weaponSprite.setVisible(weaponVisible)
    if (weaponVisible && this.weaponSprite.texture.key !== weaponTexture) this.weaponSprite.setTexture(weaponTexture)
    this.weaponSprite.setFrame(this.hero.frame.name)
    this.weaponSprite.setFlipX(this.heroState.facing === 1)
    this.weaponSprite.setAngle(this.hero.angle)
    this.weaponSprite.setAlpha(this.hero.alpha)
    this.weaponSprite.setPosition(px, py)
  }

  private renderMonsters(): void {
    for (const e of this.monsters) this.renderEntity(e)
  }

  private renderEntity(e: MonsterEntity): void {
    if (e.state.mode === 'gone') {
      e.sprite.setVisible(false)
      e.hpBar?.setVisible(false)
      return
    }
    const key = e.species + '_' + e.state.action
    // Some species omit a 'dead' row (level 4 monsters fade out with no frame);
    // only switch animations that actually exist, else hold the current pose.
    if (this.anims.exists(key) && e.sprite.anims.currentAnim?.key !== key) e.sprite.play(key)
    e.sprite.setFlipX(e.state.facing === 1)
    const frozen = this.simClockMs < e.frozenUntilMs
    if (frozen) e.sprite.setTint(0x8fc7ff)
    else if (e.burn) e.sprite.setTint(0xff8a5a)
    else e.sprite.clearTint()
    const center = this.monsterVisualCenter(e)
    e.sprite.setPosition(center.x, center.y)
    // Grunt head HP bar (hidden at full / on death); boss uses the top bar.
    // hitstun-triad pen: a fixed "-110" read fine for hero-ish-sized grunts
    // but sat inside/below a big boss's own head (cellH up to 350) and well
    // above a small imp's -- anchor off the species' own real visual top edge
    // instead (center - half its own scaled cell height - a small gap).
    // 2026-07-10 用户反馈"血条不在怪正上方"：x 此前用逻辑坐标 e.state.x，
    // 而精灵渲染在 visualCenter（含 species offset）——横向就offset出去了。
    e.hpBar?.update(e.state.hp, e.config.stats.hp, center.x, this.monsterVisibleTopY(e) - 10)
  }

  private updateParallax(): void {
    const camX = this.cameras.main.scrollX
    for (const { img, factor } of this.bgTiles) img.tilePositionX = camX * factor
  }

  private setDebugVisible(visible: boolean): void {
    this.debugVisible = visible
    for (const t of this.debugTexts) t.setVisible(visible)
    this.platformDebugOverlay?.setVisible(visible)
  }

  private clearPlatformDebugOverlay(): void {
    this.platformDebugOverlay?.destroy()
    this.platformDebugOverlay = undefined
  }

  private rebuildPlatformDebugOverlay(): void {
    this.clearPlatformDebugOverlay()
    if (this.currentWalls.length === 0) return
    const g = this.add.graphics().setDepth(55).setVisible(this.debugVisible)
    for (const wall of this.currentWalls) {
      const style = level1PlatformDebugStyle(wall)
      // Adapted placeholder: bg11 has no discrete stair texture through the
      // cloud-sea section, so this wash only makes mined platforms visible for
      // art-direction sign-off.
      if (style.fillAlpha > 0) g.fillStyle(style.fillColor, style.fillAlpha).fillRect(wall.x, wall.y, wall.width, wall.height)
      g.lineStyle(2, style.strokeColor, style.strokeAlpha).strokeRect(wall.x, wall.y, wall.width, wall.height)
    }
    this.platformDebugOverlay = g
  }

  private updateHud(): void {
    // Top-left RoleInfo (avatar + HP/MP/EXP bars + atk/weapon).
    const c = this.identity.combat
    const p = this.identity.progression
    this.roleInfoHud.update({
      level: p.level,
      hp: c.hp,
      maxHp: c.maxHp,
      mp: this.mp.mp,
      maxMp: this.mp.maxMp,
      exp: p.exp,
      expToNext: p.expToNext,
      atk: heroTotalAtk(this.identity, this.equipment),
      weaponName: this.equipment.weapon ? this.equipment.weapon.name : '空手',
    })
    // Skill dock cooldown sweep (shared busy-lock, normalized to a nominal cast).
    const cdFrac = this.skillRuntime.cooldownMs > 0 ? Math.min(1, this.skillRuntime.cooldownMs / 1000) : 0
    for (let i = 0; i < BIND_KEYS.length; i++) this.skillBar.setCooldown(i, cdFrac)
    // Rebuild slot affordability/level a few times a second (MP regens/drains).
    this.skillBarAccMs += this.game.loop.delta
    if (this.skillBarAccMs >= 300) {
      this.skillBarAccMs = 0
      this.refreshSkillBar()
    }

    if (this.debugVisible) {
      const s = this.heroState
      this.hud.setText(
        `Lv${this.campaignIndex + 1} ${this.currentCampaignName()}  怪:${this.aliveMonsters().length}` +
          `\naction:${s.action} combo:${s.combo.stage} x:${s.x.toFixed(0)}  NPC:${this.npcStatusLabel()}`,
      )
    }
  }

  /** (Re)build the bottom-left skill dock from the current bindings/MP (S5:
   * bindings are player-chosen in SkillTreeScene, not a fixed loadout). */
  private refreshSkillBar(): void {
    const slots: SkillSlotData[] = BIND_KEYS.map((key) => {
      const skillId = this.skillTreeState.bindings[key]
      if (!skillId || skillId === 'sx') {
        // Empty slot, or sx (a passive that never sits on the dock as a
        // castable action -- see castBoundSkill).
        return { hotkey: key, disabled: true }
      }
      const level = this.skillRuntime.levels[skillId]
      const mpCost = level > 0 ? getRole1SkillMpCost(skillId, level) : 0
      return { skillId, hotkey: key, mpCost, level, disabled: level <= 0 || this.mp.mp < mpCost }
    })
    this.skillBar.setSlots(slots)
  }

  private toggleBackpack(): void {
    if (this.dialogue.isOpen) return
    if (this.backpack.isOpen) {
      this.backpack.close()
    } else {
      this.refreshBackpackData()
      this.backpack.open()
    }
  }

  /** Push the current hero/equipment/bag/soul state into the backpack window.
   * Called on open and after anything the panel displays changes (equip,
   * unequip, sell) so an OPEN panel reflects the action immediately. */
  private refreshBackpackData(): void {
    const eq = this.equipment
    const equipAtkBonus = heroTotalAtk(this.identity, eq) - heroBaseStats(this.identity).atk
    this.backpack.setHeroStats({
      name: heroName(this.identity.heroId),
      level: this.identity.progression.level,
      combatPower: computeCombatPower(this.identity.progression.level, equipAtkBonus),
      hp: this.identity.combat.hp,
      maxHp: this.identity.combat.maxHp,
      mp: this.mp.mp,
      maxMp: this.mp.maxMp,
      atk: heroTotalAtk(this.identity, eq),
      def: heroTotalDef(this.identity, eq),
      luck: this.displayLuck,
      magicDefPct: heroMagicDef(this.identity) * 100,
      critPct: heroStats(this.identity, eq).crit * 100,
      dodgePct: 0, // no dodge system in this project (see BackpackWindow.ts header)
      hpRegen: 0, // no hp-regen-over-time system in this project
      mpRegen: MP_REGEN_PER_SEC,
      exp: this.identity.progression.exp,
      expToNext: this.identity.progression.expToNext,
      soul: this.soulPurse.value,
    })
    this.backpack.setEquipment(this.equipment)
    this.backpack.setInventory(listStacks(this.inventory))
  }

  // ---------- equipment ----------

  private equipFirstFromBag(): void {
    const equipItem = listStacks(this.inventory)
      .map((s) => s.item)
      .find((it) => isSupportedEquipmentForHero(it, this.identity.heroId))
    if (equipItem) this.doEquip(equipItem)
  }

  private doEquip(item: Item): boolean {
    const eligibility = equipEligibility(item, this.identity.heroId)
    if (eligibility === 'wrong_role') {
      this.showToast('悟空无法穿戴其他角色的装备', '#ff8a6b')
      return false
    }
    if (eligibility === 'unsupported_slot' || eligibility === 'missing_type') {
      this.showToast('当前只支持武器和防具', '#ff8a6b')
      return false
    }
    if (!equip(this.equipment, this.inventory, item, this.identity.heroId)) {
      // equip() now also rejects the swap (rather than deleting the worn
      // item) when the bag can't take it back -- surface that to the player
      // instead of a silent no-op (equipment.ts capacity-guard fix).
      this.showToast('背包已满，穿不下这件装备', '#ff8a6b')
      return false
    }
    syncHeroEquipment(this.identity, this.equipment) // fold new gear hp/mp into pools
    this.showToast(`装备【${item.name}】`, '#ffd873')
    this.saveToSlot() // autosave: equipment/bag changed
    if (this.backpack.isOpen) this.refreshBackpackData()
    return true
  }

  private doSellEquipmentItem(item: Item): void {
    const result = sellEquipmentItem(this.inventory, this.soulPurse, item)
    if (!result.sold) {
      this.showToast('这件物品无法出售', '#c8cfe6')
      return
    }
    this.showToast(`卖掉【${item.name}】，获得灵魂 +${result.soulGained}`, '#ffd873')
    this.saveToSlot()
    if (this.backpack.isOpen) this.refreshBackpackData()
  }

  private doUnequip(slot: EquipSlot): boolean {
    const cur = this.equipment[slot]
    if (!unequip(this.equipment, this.inventory, slot)) return false
    syncHeroEquipment(this.identity, this.equipment) // drop the gear hp/mp from pools
    this.showToast(`卸下【${cur?.name ?? ''}】`, '#c8cfe6')
    this.saveToSlot() // autosave: equipment/bag changed
    if (this.backpack.isOpen) this.refreshBackpackData()
    return true
  }

  /** 出售白装 -- ports export.pack.BackPack.as deleteWhiteEquipment (see
   * soulPurse.ts's header for the exact mapping/adaptations). */
  private doSellCommonEquipment(): void {
    const result = sellCommonEquipment(this.inventory, this.soulPurse)
    if (result.soldCount === 0) {
      this.showToast('没有可出售的白装', '#c8cfe6')
      return
    }
    this.showToast(`出售 ${result.soldCount} 件白装，获得灵魂 +${result.soulGained}`, '#ffd873')
    this.saveToSlot()
    if (this.backpack.isOpen) this.refreshBackpackData()
  }

  private npcStatusLabel(): string {
    return this.npcClient?.isOpen() ? '在线' : '闭关中'
  }

  private updateNpcUi(): void {
    if (!BATTLE_NPC_ENABLED) return
    const online = this.npcClient.isOpen()
    this.npcTag.setText(online ? NPC_NAME : `${NPC_NAME}（闭关中）`)
    this.npcTag.setColor(online ? '#d9c07a' : '#7a7f95')
    const near = Math.abs(this.heroState.x - NPC_X) < DIALOGUE_RANGE
    this.promptText.setVisible(near && online && !this.dialogue.isOpen)
  }

  // ---------- dialogue ----------

  private tryOpenDialogue(): void {
    if (!BATTLE_NPC_ENABLED) return
    if (this.dialogue.isOpen) return
    if (Math.abs(this.heroState.x - NPC_X) >= DIALOGUE_RANGE) return
    if (!this.npcClient.isOpen()) {
      this.showToast(`${NPC_NAME}正在闭关…`, '#7a7f95')
      return
    }
    this.input.keyboard!.enabled = false // free the keyboard for the input box
    if (this.dialogueFresh) {
      this.dialogue.pushLog(`${NPC_NAME}：猴头，来炼丹房作甚？`)
      this.dialogueFresh = false
    }
    this.dialogue.open()
  }

  private showToast(text: string, color = '#f0d99a'): void {
    this.toastUi.show(text, color)
  }

  private startAudioOnFirstInput(): void {
    const start = (): void => {
      if (this.bgmStarted || this.bgmUnlockQueued) return
      const play = (): void => {
        this.bgmUnlockQueued = false
        if (this.bgmStarted) return
        this.bgmStarted = true
        this.sound.add('bgm', { loop: true, volume: 0.35 }).play()
      }
      if (this.sound.locked) {
        this.bgmUnlockQueued = true
        this.sound.once(Phaser.Sound.Events.UNLOCKED, play)
        return
      }
      play()
    }
    this.input.keyboard?.once('keydown', start)
    this.input.once('pointerdown', start)
  }

  private playSfx(key: string, volume: number): void {
    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.sound.play(key, { volume }))
      return
    }
    this.sound.play(key, { volume })
  }

  private exposeDebugHooks(): void {
    const w = window as unknown as Record<string, unknown>
    w.__scene = this
    w.__inject = (edge: keyof HeroEdges) => {
      this.injected[edge] = true
    }
    // 验收专用：刀光/连击横幅是 ~200ms 瞬时效果，盲截图逮不住帧——暴露演示钩子。
    w.__fxDemo = (n: number) => {
      const c = this.heroVisualCenter()
      this.spawnRole1Effect('hit5', c.x + this.heroState.facing * 72, c.y - 10, this.heroState.facing)
      this.showComboBanner(n)
    }
    w.__heroState = () => ({
      action: this.heroState.action,
      x: this.heroState.x,
      y: this.heroState.vertical.y,
      grounded: this.heroState.vertical.grounded,
      comboStage: this.heroState.combo.stage,
      attackId: this.heroState.attackId,
      facing: this.heroState.facing,
    })
    const nearestMonster = (): MonsterEntity | null => {
      let best: MonsterEntity | null = null
      let bestD = Infinity
      for (const e of this.aliveMonsters()) {
        const d = Math.abs(e.state.x - this.heroState.x)
        if (d < bestD) { bestD = d; best = e }
      }
      return best
    }
    w.__worldState = () => {
      const nm = nearestMonster()
      return {
        level: this.identity.progression.level,
        campaignIndex: this.campaignIndex,
        levelName: this.currentCampaignName(),
        subStage: this.level1Chain ? currentSubStage(this.level1Chain).id : null,
        aliveMonsters: this.aliveMonsters().length,
        boss: this.bossEntity
          ? { species: this.bossEntity.species, hp: Math.round(this.bossEntity.state.hp), maxHp: this.bossEntity.config.stats.hp, mode: this.bossEntity.state.mode }
          : null,
        portalOpen: this.activeDoor().visible,
        // Back-compat: report the nearest monster under the old `monster` key.
        monster: nm ? { species: nm.species, x: Math.round(nm.state.x), hp: Math.round(nm.state.hp), mode: nm.state.mode } : null,
        drops: this.drops.map((d) => ({
          id: d.kind === 'soul' ? 'soul' : d.kind === 'consumable' ? d.consumableId : d.item.id,
          x: Math.round(d.x),
          grounded: d.grounded,
        })),
        inventory: listStacks(this.inventory).map((s) => ({ id: s.item.id, name: s.item.name, qty: s.qty })),
        heroHp: Math.round(this.identity.combat.hp),
        heroMaxHp: this.identity.combat.maxHp,
        heroDead: isHeroDead(this.identity),
        heroState: this.identity.combat.state,
        exp: this.identity.progression.exp,
        expToNext: this.identity.progression.expToNext,
        atk: heroTotalAtk(this.identity, this.equipment),
        def: heroTotalDef(this.identity, this.equipment),
        weapon: this.equipment.weapon ? this.equipment.weapon.name : null,
        weaponVisible: this.weaponSprite.visible,
      }
    }
    w.__teleportTo = (x: number) => {
      this.heroState.x = x
    }
    // Combat acceptance hooks: drive death/respawn and leveling deterministically
    // without having to grind the live monster.
    w.__damageHero = (dmg: number) => {
      const hit: HeroHit = {
        sourceId: 'debug',
        attackId: ++this.skillAttackId,
        damage: dmg,
        knockbackX: -1,
      }
      return damageHero(this.identity, hit, this.simClockMs).map((e) => e.type)
    }
    w.__killHero = () => {
      // Debug kill bypasses any active i-frames so it always lands.
      this.identity.combat.invulnerableUntilMs = 0
      this.identity.combat.meterInvulnerableUntilMs = undefined
      const hit: HeroHit = {
        sourceId: 'debug',
        attackId: ++this.skillAttackId,
        damage: this.identity.combat.maxHp + 999,
        knockbackX: -1,
      }
      const evs = damageHero(this.identity, hit, this.simClockMs).map((e) => e.type)
      if (evs.includes('death')) this.showToast(`${'悟空倒地'}…`, '#ff6b6b')
      return evs
    }
    // Acceptance helpers to hold a death frame regardless of wall-clock: kill
    // and suspend the auto-respawn timer, then release it on demand.
    w.__killHeroSticky = () => {
      const evs = (w.__killHero as () => string[])()
      this.identity.combat.respawnAtMs = Number.POSITIVE_INFINITY
      return evs
    }
    w.__respawnHero = () => {
      // Make the respawn due now; updateHeroIdentity fires it next frame.
      this.identity.combat.respawnAtMs = this.simClockMs
    }
    w.__gainExp = (amount: number) => {
      const r = gainHeroExp(this.identity, amount)
      if (r.levelsGained > 0) this.showToast(`升级！ Lv.${r.levelAfter}`, '#ffe066')
      return { level: r.levelAfter, levelsGained: r.levelsGained, exp: this.identity.progression.exp }
    }
    // Equipment acceptance hooks.
    w.__equip = (itemId?: string) => {
      const item = itemId
        ? listStacks(this.inventory).map((s) => s.item).find((it) => it.id === itemId)
        : listStacks(this.inventory).map((s) => s.item).find((it) => slotForItem(it) !== null)
      return item ? this.doEquip(item) : false
    }
    w.__unequip = () => this.doUnequip('weapon')
    w.__setHeroHp = (hp: number) => {
      this.identity.combat.hp = Math.max(0, Math.min(this.identity.combat.maxHp, hp))
    }
    w.__giveCraftedWeapon = () => {
      // A test weapon with atk + guaranteed lifesteal, mirroring an NPC craft.
      const it: Item = {
        id: 'test_chiyan',
        name: '赤炎噬血杖',
        kind: 'equip',
        rarity: 3,
        sourceType: 'zbwq',
        sourceUser: '悟空',
        sourceSaleValue: 160,
        effects: [
          { type: 'stat', stat: 'atk', value: 45 },
          { type: 'onHit', effect: 'lifesteal', chance: 1, power: 25 },
        ],
      }
      addItem(this.inventory, it, 1)
    }
    // Grant a bundle of real monster materials (acceptance shortcut for the
    // furnace flow, standing in for several kills' drops).
    w.__giveMaterials = () => {
      const tanmu: Item = { id: 'wptm', name: '檀木', kind: 'material', rarity: 1, sourceFillName: 'wptm', sourceType: 'zbwp', sourceQuality: '普 通', sourceArray: 'wpEquipment' }
      const xuantie: Item = { id: 'wpxt', name: '玄铁', kind: 'material', rarity: 1, sourceFillName: 'wpxt', sourceType: 'zbwp', sourceQuality: '普 通', sourceArray: 'wpEquipment' }
      addItem(this.inventory, tanmu, 20)
      addItem(this.inventory, xuantie, 12)
      return this.bagMaterials().map((m) => ({ id: m.item.id, name: m.item.name, qty: m.qty }))
    }
    w.__npc = () => ({
      status: this.npcStatus,
      online: this.npcClient.isOpen(),
      dialogueOpen: this.dialogue.isOpen,
      log: this.dialogue.logLines(),
    })
    // Drive a real conversation without touching the DOM input.
    w.__npcSay = (text: string) => {
      if (!this.dialogue.isOpen) this.tryOpenDialogue()
      if (!this.dialogue.isOpen) return false
      this.dialogue.pushLog(`悟空：${text}`)
      return this.npcClient.playerSay(NPC_ID, text, 'p1')
    }
    w.__npcOpen = () => this.tryOpenDialogue()
    w.__npcClose = () => this.dialogue.close()
    // Forge acceptance hooks — drive the real craft path (lock/request/validate).
    w.__openCraft = () => {
      if (!this.dialogue.isOpen) this.tryOpenDialogue()
      this.openCraftMode()
      return this.furnacePanel.isOpen
    }
    w.__submitCraft = (description: string, sel: { id: string; qty: number }[]) => {
      const stacks = listStacks(this.inventory)
      const lots: MaterialLot[] = []
      for (const s of sel) {
        const stack = stacks.find((st) => st.item.id === s.id)
        if (stack) lots.push({ item: stack.item, qty: s.qty })
      }
      this.submitCraft(description, lots)
      return { pending: !!this.craftPending, requestId: this.craftPending?.requestId ?? null }
    }
    w.__craftState = () => ({
      pending: !!this.craftPending,
      requestId: this.craftPending?.requestId ?? null,
      craftMode: this.furnacePanel.isOpen,
      materials: this.bagMaterials().map((m) => ({ id: m.item.id, name: m.item.name, qty: m.qty })),
    })
    // Save-slot acceptance hooks.
    w.__saveState = () => ({
      activeSlot: this.activeSlot,
      origin: this.saveOrigin,
      playtimeSec: this.playtimeSec,
      level: this.identity.progression.level,
      exp: this.identity.progression.exp,
      weapon: this.equipment.weapon ? this.equipment.weapon.name : null,
      inventory: listStacks(this.inventory).map((s) => ({ id: s.item.id, name: s.item.name, qty: s.qty })),
    })
    w.__saveNow = () => {
      this.saveToSlot()
      return this.activeSlot
    }
    w.__togglePause = () => {
      this.togglePause()
      return this.paused
    }
    w.__returnToMenu = () => this.returnToMainMenu()
    // Skill / MP acceptance hooks.
    w.__castSkill = (skillId: Role1SkillId) => {
      const mpBefore = Math.round(this.mp.mp)
      const monsterHpBefore = Math.round(this.aliveMonsters()[0]?.state.hp ?? 0)
      this.castSkill(skillId)
      return {
        cast: this.skillAnim?.action ?? null,
        mpBefore,
        mpAfter: Math.round(this.mp.mp),
        cooldownMs: Math.round(this.skillRuntime.cooldownMs),
        monsterHpBefore,
      }
    }
    // S5 acceptance hook: exercises the exact keydown-Y/U/I/O/L production path
    // (dock-binding lookup -> castSkill), for headless verification that the
    // player-chosen skillTree binding is what actually fires -- real DOM
    // KeyboardEvents are unreliable to route into Phaser's keyboard plugin from
    // an automated driver without a live focused canvas, so this calls the
    // same private method the real keydown-<key> listener calls (see the
    // `kb.on('keydown-'+key, ...)` loop in create()), not a re-implementation.
    w.__castBoundSkill = (key: BindKey) => {
      const mpBefore = Math.round(this.mp.mp)
      const monsterHpBefore = Math.round(this.aliveMonsters()[0]?.state.hp ?? 0)
      const boundSkill = this.skillTreeState.bindings[key]
      this.castBoundSkill(key)
      return {
        key,
        boundSkill,
        cast: this.skillAnim?.action ?? null,
        mpBefore,
        mpAfter: Math.round(this.mp.mp),
        monsterHpBefore,
        monsterHpAfter: Math.round(this.aliveMonsters()[0]?.state.hp ?? 0),
      }
    }
    w.__skillState = () => ({
      mp: Math.round(this.mp.mp),
      maxMp: this.mp.maxMp,
      cooldownMs: Math.round(this.skillRuntime.cooldownMs),
      levels: this.skillRuntime.levels,
      monsterHp: Math.round(this.aliveMonsters()[0]?.state.hp ?? 0),
    })
    w.__setSkillLevels = (levels: Partial<Role1SkillLevels>) => {
      syncRole1SkillLevels(this.skillRuntime, levels)
      return this.skillRuntime.levels
    }
    w.__toggleBackpack = () => {
      this.toggleBackpack()
      return this.backpack.isOpen
    }
    // Level-chain acceptance hooks.
    w.__levelState = () => ({
      campaignIndex: this.campaignIndex,
      name: this.currentCampaignName(),
      subStage: this.level1Chain ? currentSubStage(this.level1Chain).id : null,
      aliveMonsters: this.aliveMonsters().map((e) => ({ species: e.species, hp: Math.round(e.state.hp), isBoss: e.isBoss })),
      boss: this.bossEntity
        ? { species: this.bossEntity.species, hp: Math.round(this.bossEntity.state.hp), maxHp: this.bossEntity.config.stats.hp, dead: isBossDead(this.bossEntity.state) }
        : null,
      portalOpen: this.activeDoor().visible,
      bossTriggered: this.levelState.bossTriggered,
    })
    // Queue a lethal hit into every live grunt (drives the wave machine forward).
    w.__killGrunts = () => {
      let n = 0
      for (const e of this.aliveMonsters()) {
        if (e.isBoss) continue
        e.hitQueue.push({ attackId: ++this.skillAttackId, damage: e.state.hp + e.config.stats.def + 99999 })
        n++
      }
      return n
    }
    // Queue a lethal hit into the boss.
    w.__killBoss = () => {
      if (!this.bossEntity || isBossDead(this.bossEntity.state)) return false
      this.bossEntity.hitQueue.push({
        attackId: ++this.skillAttackId,
        damage: this.bossEntity.state.hp + this.bossEntity.config.stats.def + 99999,
      })
      return true
    }
    // Walk into the portal (teleports the hero to the door first) and advance.
    // Dismiss the clear banner first if it's still up (boss just died).
    w.__usePortal = () => {
      if (this.resultBanner.isOpen) this.dismissResultBanner()
      const d = this.activeDoor()
      this.heroState.x = d.x + d.width / 2
      this.heroState.vertical.y = d.y + d.height / 2
      return this.tryUsePortal()
    }
    w.__toggleDebug = () => {
      this.setDebugVisible(!this.debugVisible)
      return this.debugVisible
    }
  }
}
