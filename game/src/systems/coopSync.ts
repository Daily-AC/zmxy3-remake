export type CoopRole = 'host' | 'peer'
export type Facing = -1 | 1

// 120ms gives the renderer a little over one 10Hz snapshot interval to find
// bracketing samples without making remote movement feel overly delayed.
export const DEFAULT_RENDER_DELAY_MS = 120
export const MAX_INTERPOLATION_SAMPLES = 20

export interface Position {
  x: number
  y: number
}

export interface PositionSample extends Position {
  timeMs: number
}

export interface HeroStateSnapshot {
  userId: string
  heroId: string
  x: number
  y: number
  facing: Facing
  action: string
  animState: string
  hp: number
  maxHp: number
  alive: boolean
}

export interface MonsterStateSnapshot {
  monsterId: string
  x: number
  y: number
  facing: Facing
  action: string
  hp: number
  maxHp: number
  alive: boolean
}

export interface HeroStatePayload {
  coopType: 'hero_state'
  hero: HeroStateSnapshot
}

export interface MonsterStatePayload {
  coopType: 'monster_state'
  monsters: MonsterStateSnapshot[]
}

export type CoopStatePayload = HeroStatePayload | MonsterStatePayload

export interface CoopStateMessage {
  type: 'state'
  seq: number
  sentAt: number
  payload: CoopStatePayload
  fromUserId?: string
}

export interface HitIntentPayload {
  attackerUserId: string
  targetMonsterId: string
  attackId: string
  skillId?: string
  clientTimeMs: number
}

export interface HitSettlementPayload {
  attackerUserId: string
  targetMonsterId: string
  attackId: string
  damageDealt: number
  monsterHp: number
  monsterMaxHp: number
  monsterAlive: boolean
  killed: boolean
}

export type CoopEventName = 'hit_intent' | 'hit_settlement'

export type CoopEventMessage =
  | { type: 'event'; name: 'hit_intent'; payload: HitIntentPayload; fromUserId?: string }
  | { type: 'event'; name: 'hit_settlement'; payload: HitSettlementPayload; fromUserId?: string }

export type CoopOutboundMessage = CoopStateMessage | CoopEventMessage
export type CoopInboundMessage = CoopOutboundMessage

export interface RemoteHeroView {
  snapshot: HeroStateSnapshot
  positionSamples: PositionSample[]
}

export interface RemoteMonsterView {
  snapshot: MonsterStateSnapshot
  positionSamples: PositionSample[]
}

export interface CoopSyncState {
  localUserId: string
  hostUserId: string
  role: CoopRole
  lastStateSeqBySender: Record<string, number>
  heroes: Record<string, RemoteHeroView>
  monsters: Record<string, RemoteMonsterView>
}

export type CoopSyncEffect =
  | { type: 'hero_updated'; userId: string }
  | { type: 'monster_updated'; monsterId: string }
  | { type: 'monster_died'; monsterId: string; killedByUserId?: string }
  | { type: 'stale_state_discarded'; fromUserId: string; seq: number; lastSeq: number }
  | { type: 'monster_state_ignored'; fromUserId: string; reason: 'non_host_sender' }
  | { type: 'hit_intent_ignored'; targetMonsterId: string; reason: 'not_host' | 'missing_monster' | 'dead_monster' | 'no_resolver' }
  | { type: 'hit_settlement_ignored'; fromUserId: string; reason: 'non_host_sender' }
  | {
      type: 'hit_settlement_created'
      targetMonsterId: string
      damageDealt: number
      monsterHp: number
      killed: boolean
    }

export interface CoopApplyResult {
  state: CoopSyncState
  effects: CoopSyncEffect[]
  outgoing: CoopEventMessage[]
}

export interface HostHitResolution {
  damageDealt: number
}

export interface CoopApplyOptions {
  resolveHitIntent?: (
    intent: HitIntentPayload,
    target: MonsterStateSnapshot,
    state: CoopSyncState,
  ) => HostHitResolution
}

export function createCoopSyncState(options: { localUserId: string; hostUserId: string }): CoopSyncState {
  return {
    localUserId: options.localUserId,
    hostUserId: options.hostUserId,
    role: options.localUserId === options.hostUserId ? 'host' : 'peer',
    lastStateSeqBySender: {},
    heroes: {},
    monsters: {},
  }
}

export function encodeHeroState(hero: HeroStateSnapshot, seq: number, sentAt: number): CoopStateMessage {
  return {
    type: 'state',
    seq,
    sentAt,
    payload: { coopType: 'hero_state', hero: { ...hero } },
  }
}

export function encodeMonsterState(
  monsters: MonsterStateSnapshot[],
  seq: number,
  sentAt: number,
): CoopStateMessage {
  return {
    type: 'state',
    seq,
    sentAt,
    payload: { coopType: 'monster_state', monsters: monsters.map((monster) => ({ ...monster })) },
  }
}

export function encodeHitIntent(intent: HitIntentPayload): CoopEventMessage {
  return {
    type: 'event',
    name: 'hit_intent',
    payload: { ...intent },
  }
}

export function encodeHitSettlement(settlement: HitSettlementPayload): CoopEventMessage {
  return {
    type: 'event',
    name: 'hit_settlement',
    payload: { ...settlement },
  }
}

export function encodeCoopMessage(message: CoopOutboundMessage): string {
  return JSON.stringify(message)
}

export function decodeCoopMessage(raw: unknown): CoopInboundMessage | null {
  const obj = parseRawMessage(raw)
  if (!isRecord(obj) || typeof obj.type !== 'string') return null

  if (obj.type === 'state') {
    if (!isFiniteNumber(obj.seq) || !isFiniteNumber(obj.sentAt)) return null
    const payload = decodeStatePayload(obj.payload)
    if (!payload) return null
    return {
      type: 'state',
      seq: obj.seq,
      sentAt: obj.sentAt,
      payload,
      ...(typeof obj.fromUserId === 'string' ? { fromUserId: obj.fromUserId } : {}),
    }
  }

  if (obj.type === 'event') {
    if (obj.name === 'hit_intent') {
      const payload = decodeHitIntent(obj.payload)
      if (!payload) return null
      return {
        type: 'event',
        name: 'hit_intent',
        payload,
        ...(typeof obj.fromUserId === 'string' ? { fromUserId: obj.fromUserId } : {}),
      }
    }
    if (obj.name === 'hit_settlement') {
      const payload = decodeHitSettlement(obj.payload)
      if (!payload) return null
      return {
        type: 'event',
        name: 'hit_settlement',
        payload,
        ...(typeof obj.fromUserId === 'string' ? { fromUserId: obj.fromUserId } : {}),
      }
    }
  }

  return null
}

export function isStaleSeq(lastAcceptedSeq: number | undefined, incomingSeq: number): boolean {
  return lastAcceptedSeq !== undefined && incomingSeq <= lastAcceptedSeq
}

export function addInterpolationSample(
  samples: PositionSample[],
  sample: PositionSample,
  maxSamples = MAX_INTERPOLATION_SAMPLES,
): PositionSample[] {
  const next = samples.filter((candidate) => candidate.timeMs !== sample.timeMs)
  next.push({ ...sample })
  next.sort((a, b) => a.timeMs - b.timeMs)
  return next.slice(Math.max(0, next.length - maxSamples))
}

export function interpolatePosition(
  samples: PositionSample[],
  nowMs: number,
  renderDelayMs = DEFAULT_RENDER_DELAY_MS,
): Position | null {
  if (samples.length === 0) return null

  const ordered = [...samples].sort((a, b) => a.timeMs - b.timeMs)
  const targetTime = nowMs - renderDelayMs
  const first = ordered[0]
  const latest = ordered[ordered.length - 1]
  if (!first || !latest) return null
  if (ordered.length === 1 || targetTime <= first.timeMs) return { x: first.x, y: first.y }
  if (targetTime >= latest.timeMs) return { x: latest.x, y: latest.y }

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1]
    const next = ordered[i]
    if (!previous || !next || targetTime > next.timeMs) continue
    if (next.timeMs === previous.timeMs) return { x: next.x, y: next.y }
    const ratio = (targetTime - previous.timeMs) / (next.timeMs - previous.timeMs)
    return {
      x: previous.x + (next.x - previous.x) * ratio,
      y: previous.y + (next.y - previous.y) * ratio,
    }
  }

  return { x: latest.x, y: latest.y }
}

export function applyCoopMessage(
  state: CoopSyncState,
  message: CoopInboundMessage,
  options: CoopApplyOptions = {},
): CoopApplyResult {
  if (message.type === 'state') return applyStateMessage(state, message)
  if (message.name === 'hit_intent') return applyHitIntent(state, message.payload, options)
  return applyHitSettlement(state, message)
}

function applyStateMessage(state: CoopSyncState, message: CoopStateMessage): CoopApplyResult {
  const fromUserId = stateSender(message, state)
  const lastSeq = state.lastStateSeqBySender[fromUserId]
  if (isStaleSeq(lastSeq, message.seq)) {
    return {
      state,
      effects: [{ type: 'stale_state_discarded', fromUserId, seq: message.seq, lastSeq }],
      outgoing: [],
    }
  }

  if (message.payload.coopType === 'hero_state') {
    const hero = message.payload.hero
    return {
      state: {
        ...state,
        lastStateSeqBySender: { ...state.lastStateSeqBySender, [fromUserId]: message.seq },
        heroes: {
          ...state.heroes,
          [hero.userId]: {
            snapshot: { ...hero },
            positionSamples: addInterpolationSample(state.heroes[hero.userId]?.positionSamples ?? [], {
              timeMs: message.sentAt,
              x: hero.x,
              y: hero.y,
            }),
          },
        },
      },
      effects: [{ type: 'hero_updated', userId: hero.userId }],
      outgoing: [],
    }
  }

  if (fromUserId !== state.hostUserId) {
    return {
      state,
      effects: [{ type: 'monster_state_ignored', fromUserId, reason: 'non_host_sender' }],
      outgoing: [],
    }
  }

  const monsters = { ...state.monsters }
  const effects: CoopSyncEffect[] = []
  for (const monster of message.payload.monsters) {
    const previous = monsters[monster.monsterId]
    monsters[monster.monsterId] = {
      snapshot: { ...monster },
      positionSamples: addInterpolationSample(previous?.positionSamples ?? [], {
        timeMs: message.sentAt,
        x: monster.x,
        y: monster.y,
      }),
    }
    effects.push({ type: 'monster_updated', monsterId: monster.monsterId })
    if (previous?.snapshot.alive && !monster.alive) {
      effects.push({ type: 'monster_died', monsterId: monster.monsterId })
    }
  }

  return {
    state: {
      ...state,
      lastStateSeqBySender: { ...state.lastStateSeqBySender, [fromUserId]: message.seq },
      monsters,
    },
    effects,
    outgoing: [],
  }
}

function applyHitIntent(
  state: CoopSyncState,
  intent: HitIntentPayload,
  options: CoopApplyOptions,
): CoopApplyResult {
  if (state.role !== 'host') {
    return {
      state,
      effects: [{ type: 'hit_intent_ignored', targetMonsterId: intent.targetMonsterId, reason: 'not_host' }],
      outgoing: [],
    }
  }

  const targetView = state.monsters[intent.targetMonsterId]
  if (!targetView) {
    return {
      state,
      effects: [{ type: 'hit_intent_ignored', targetMonsterId: intent.targetMonsterId, reason: 'missing_monster' }],
      outgoing: [],
    }
  }
  if (!targetView.snapshot.alive) {
    return {
      state,
      effects: [{ type: 'hit_intent_ignored', targetMonsterId: intent.targetMonsterId, reason: 'dead_monster' }],
      outgoing: [],
    }
  }
  if (!options.resolveHitIntent) {
    return {
      state,
      effects: [{ type: 'hit_intent_ignored', targetMonsterId: intent.targetMonsterId, reason: 'no_resolver' }],
      outgoing: [],
    }
  }

  const damageDealt = Math.max(0, options.resolveHitIntent(intent, targetView.snapshot, state).damageDealt)
  const monsterHp = Math.max(0, targetView.snapshot.hp - damageDealt)
  const monsterAlive = targetView.snapshot.alive && monsterHp > 0
  const killed = targetView.snapshot.alive && !monsterAlive
  const nextMonster: MonsterStateSnapshot = {
    ...targetView.snapshot,
    hp: monsterHp,
    alive: monsterAlive,
  }
  const settlement = encodeHitSettlement({
    attackerUserId: intent.attackerUserId,
    targetMonsterId: intent.targetMonsterId,
    attackId: intent.attackId,
    damageDealt,
    monsterHp,
    monsterMaxHp: targetView.snapshot.maxHp,
    monsterAlive,
    killed,
  })
  const effects: CoopSyncEffect[] = [
    {
      type: 'hit_settlement_created',
      targetMonsterId: intent.targetMonsterId,
      damageDealt,
      monsterHp,
      killed,
    },
  ]
  if (killed) effects.push({ type: 'monster_died', monsterId: intent.targetMonsterId, killedByUserId: intent.attackerUserId })

  return {
    state: {
      ...state,
      monsters: {
        ...state.monsters,
        [intent.targetMonsterId]: {
          snapshot: nextMonster,
          positionSamples: targetView.positionSamples,
        },
      },
    },
    effects,
    outgoing: [settlement],
  }
}

function applyHitSettlement(state: CoopSyncState, message: Extract<CoopEventMessage, { name: 'hit_settlement' }>): CoopApplyResult {
  const fromUserId = message.fromUserId ?? state.hostUserId
  if (fromUserId !== state.hostUserId) {
    return {
      state,
      effects: [{ type: 'hit_settlement_ignored', fromUserId, reason: 'non_host_sender' }],
      outgoing: [],
    }
  }

  const settlement = message.payload
  const existing = state.monsters[settlement.targetMonsterId]
  const previousAlive = existing?.snapshot.alive ?? true
  const snapshot: MonsterStateSnapshot = {
    ...(existing?.snapshot ?? {
      monsterId: settlement.targetMonsterId,
      x: 0,
      y: 0,
      facing: 1 as Facing,
      action: 'wait',
      hp: settlement.monsterHp,
      maxHp: settlement.monsterMaxHp,
      alive: settlement.monsterAlive,
    }),
    hp: settlement.monsterHp,
    maxHp: settlement.monsterMaxHp,
    alive: settlement.monsterAlive,
  }
  const effects: CoopSyncEffect[] = [{ type: 'monster_updated', monsterId: settlement.targetMonsterId }]
  if ((settlement.killed || previousAlive) && !settlement.monsterAlive) {
    effects.push({
      type: 'monster_died',
      monsterId: settlement.targetMonsterId,
      killedByUserId: settlement.attackerUserId,
    })
  }

  return {
    state: {
      ...state,
      monsters: {
        ...state.monsters,
        [settlement.targetMonsterId]: {
          snapshot,
          positionSamples: existing?.positionSamples ?? [],
        },
      },
    },
    effects,
    outgoing: [],
  }
}

function stateSender(message: CoopStateMessage, state: CoopSyncState): string {
  if (message.fromUserId) return message.fromUserId
  if (message.payload.coopType === 'hero_state') return message.payload.hero.userId
  return state.hostUserId
}

function parseRawMessage(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function decodeStatePayload(value: unknown): CoopStatePayload | null {
  if (!isRecord(value) || typeof value.coopType !== 'string') return null
  if (value.coopType === 'hero_state') {
    return isHeroStateSnapshot(value.hero) ? { coopType: 'hero_state', hero: value.hero } : null
  }
  if (value.coopType === 'monster_state') {
    if (!Array.isArray(value.monsters) || !value.monsters.every(isMonsterStateSnapshot)) return null
    return { coopType: 'monster_state', monsters: value.monsters }
  }
  return null
}

function decodeHitIntent(value: unknown): HitIntentPayload | null {
  if (!isRecord(value)) return null
  if (
    typeof value.attackerUserId !== 'string' ||
    typeof value.targetMonsterId !== 'string' ||
    typeof value.attackId !== 'string' ||
    !isFiniteNumber(value.clientTimeMs)
  ) {
    return null
  }
  if (value.skillId !== undefined && typeof value.skillId !== 'string') return null
  return {
    attackerUserId: value.attackerUserId,
    targetMonsterId: value.targetMonsterId,
    attackId: value.attackId,
    ...(typeof value.skillId === 'string' ? { skillId: value.skillId } : {}),
    clientTimeMs: value.clientTimeMs,
  }
}

function decodeHitSettlement(value: unknown): HitSettlementPayload | null {
  if (!isRecord(value)) return null
  if (
    typeof value.attackerUserId !== 'string' ||
    typeof value.targetMonsterId !== 'string' ||
    typeof value.attackId !== 'string' ||
    !isFiniteNumber(value.damageDealt) ||
    !isFiniteNumber(value.monsterHp) ||
    !isFiniteNumber(value.monsterMaxHp) ||
    typeof value.monsterAlive !== 'boolean' ||
    typeof value.killed !== 'boolean'
  ) {
    return null
  }
  return {
    attackerUserId: value.attackerUserId,
    targetMonsterId: value.targetMonsterId,
    attackId: value.attackId,
    damageDealt: value.damageDealt,
    monsterHp: value.monsterHp,
    monsterMaxHp: value.monsterMaxHp,
    monsterAlive: value.monsterAlive,
    killed: value.killed,
  }
}

function isHeroStateSnapshot(value: unknown): value is HeroStateSnapshot {
  if (!isRecord(value)) return false
  return (
    typeof value.userId === 'string' &&
    typeof value.heroId === 'string' &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFacing(value.facing) &&
    typeof value.action === 'string' &&
    typeof value.animState === 'string' &&
    isFiniteNumber(value.hp) &&
    isFiniteNumber(value.maxHp) &&
    typeof value.alive === 'boolean'
  )
}

function isMonsterStateSnapshot(value: unknown): value is MonsterStateSnapshot {
  if (!isRecord(value)) return false
  return (
    typeof value.monsterId === 'string' &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFacing(value.facing) &&
    typeof value.action === 'string' &&
    isFiniteNumber(value.hp) &&
    isFiniteNumber(value.maxHp) &&
    typeof value.alive === 'boolean'
  )
}

function isFacing(value: unknown): value is Facing {
  return value === -1 || value === 1
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
