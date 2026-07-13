import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function assertRecord(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value
}

export function assertFiniteNonNegative(value, label) {
  assert.equal(typeof value, 'number', `${label} must be a number`)
  assert(Number.isFinite(value), `${label} must be finite`)
  assert(value >= 0, `${label} must be non-negative`)
  return value
}

export function assertNonNegativeInteger(value, label) {
  assertFiniteNonNegative(value, label)
  assert(Number.isInteger(value), `${label} must be an integer`)
  return value
}

export function assertDistribution(value, label, options = {}) {
  const distribution = assertRecord(value, label)
  const count = assertNonNegativeInteger(distribution.count, `${label}.count`)
  const p50Ms = assertFiniteNonNegative(distribution.p50Ms, `${label}.p50Ms`)
  const p95Ms = assertFiniteNonNegative(distribution.p95Ms, `${label}.p95Ms`)
  const maxMs = assertFiniteNonNegative(distribution.maxMs, `${label}.maxMs`)
  assert(p50Ms <= p95Ms, `${label}.p50Ms must be <= p95Ms`)
  assert(p95Ms <= maxMs, `${label}.p95Ms must be <= maxMs`)

  if (options.withDrops) {
    const droppedFrameCount = assertNonNegativeInteger(
      distribution.droppedFrameCount,
      `${label}.droppedFrameCount`,
    )
    const droppedFrameRate = assertFiniteNonNegative(
      distribution.droppedFrameRate,
      `${label}.droppedFrameRate`,
    )
    assert(droppedFrameCount <= count, `${label}.droppedFrameCount must be <= count`)
    assert(droppedFrameRate <= 1, `${label}.droppedFrameRate must be <= 1`)
    const expectedRate = count === 0 ? 0 : droppedFrameCount / count
    assert(Math.abs(droppedFrameRate - expectedRate) <= Number.EPSILON, `${label}.droppedFrameRate is inconsistent`)
  }
  return distribution
}

export function assertSimulationRun(value, label) {
  const run = assertRecord(value, label)
  assertNonNegativeInteger(run.actors, `${label}.actors`)
  assertNonNegativeInteger(run.warmupTicks, `${label}.warmupTicks`)
  assertNonNegativeInteger(run.measuredTicks, `${label}.measuredTicks`)
  const p50Ms = assertFiniteNonNegative(run.p50Ms, `${label}.p50Ms`)
  const p95Ms = assertFiniteNonNegative(run.p95Ms, `${label}.p95Ms`)
  const maxMs = assertFiniteNonNegative(run.maxMs, `${label}.maxMs`)
  assert(p50Ms <= p95Ms, `${label}.p50Ms must be <= p95Ms`)
  assert(p95Ms <= maxMs, `${label}.p95Ms must be <= maxMs`)
  return run
}

function stableStringifyForVerification(value) {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new TypeError('value is not JSON-serializable')
    }
    return encoded
  }
  if (Array.isArray(value)) return `[${value.map(stableStringifyForVerification).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringifyForVerification(value[key])}`
  )).join(',')}}`
}

export function stableHashForVerification(value) {
  const input = stableStringifyForVerification(value)
  let hash = 0x811c9dc5
  const writeByte = (byte) => {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  for (const character of input) {
    const codePoint = character.codePointAt(0)
    if (codePoint <= 0x7f) {
      writeByte(codePoint)
    } else if (codePoint <= 0x7ff) {
      writeByte(0xc0 | (codePoint >>> 6))
      writeByte(0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      writeByte(0xe0 | (codePoint >>> 12))
      writeByte(0x80 | ((codePoint >>> 6) & 0x3f))
      writeByte(0x80 | (codePoint & 0x3f))
    } else {
      writeByte(0xf0 | (codePoint >>> 18))
      writeByte(0x80 | ((codePoint >>> 12) & 0x3f))
      writeByte(0x80 | ((codePoint >>> 6) & 0x3f))
      writeByte(0x80 | (codePoint & 0x3f))
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function npmInvocation(
  args,
  {
    platform = process.platform,
    execPath = process.execPath,
    npmExecPath = process.env.npm_execpath,
  } = {},
) {
  const cliPath = npmExecPath || (platform === 'win32'
    ? path.win32.join(path.win32.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null)
  return cliPath
    ? { command: execPath, args: [cliPath, ...args] }
    : { command: 'npm', args }
}

export function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

export function assertCombatCoreBugBundle(value, expected) {
  const bundle = assertRecord(value, 'bugBundle')
  assert.equal(bundle.schemaVersion, 1)
  for (const field of [
    'gameVersion',
    'contentVersion',
    'saveSchemaVersion',
    'protocolVersion',
    'presentationVersion',
    'randomSeed',
  ]) {
    assert.equal(bundle[field], expected[field], `bugBundle.${field}`)
  }

  assert(Array.isArray(bundle.recentCommands), 'bugBundle.recentCommands must be an array')
  assert(bundle.recentCommands.some((command) => (
    command?.actorId === 'hero-1' && command?.type === 'press-attack'
  )), 'bugBundle.recentCommands must contain hero press-attack')
  assert(Array.isArray(bundle.domainEvents), 'bugBundle.domainEvents must be an array')
  assert(bundle.domainEvents.some((event) => (
    event?.type === 'attack-started' && event?.sourceId === 'hero-1' && event?.action === 'hit1'
  )), 'bugBundle.domainEvents must contain the hero whiff attack-started event')
  assert(!bundle.domainEvents.some((event) => event?.type === 'hit-confirmed'), 'bugBundle whiff must not hit-confirm')

  assert(Array.isArray(bundle.presentationCues), 'bugBundle.presentationCues must be an array')
  const swing = bundle.presentationCues.find((cue) => cue?.type === 'swing' && cue?.payload?.actorId === 'hero-1')
  assert(swing, 'bugBundle.presentationCues must contain the hero swing cue')
  assert.equal(swing.presentationVersion, expected.presentationVersion, 'bugBundle swing presentationVersion')
  assert.equal(swing.payload.action, 'hit1', 'bugBundle swing action')
  assert.equal(swing.payload.effect, 'hit1', 'bugBundle swing effect')
  assert.equal(swing.payload.sound, 'hit12', 'bugBundle swing sound')

  assert(Array.isArray(bundle.structuredLogs), 'bugBundle.structuredLogs must be an array')
  const logScopes = new Set()
  for (const [index, log] of bundle.structuredLogs.entries()) {
    assertRecord(log, `bugBundle.structuredLogs[${index}]`)
    assert.equal(typeof log.scope, 'string', `bugBundle.structuredLogs[${index}].scope`)
    assert.equal(typeof log.event, 'string', `bugBundle.structuredLogs[${index}].event`)
    if (log.tick !== undefined) assertNonNegativeInteger(log.tick, `bugBundle.structuredLogs[${index}].tick`)
    logScopes.add(log.scope)
  }
  for (const scope of ['command', 'domain', 'presentation', 'tick']) {
    assert(logScopes.has(scope), `bugBundle.structuredLogs must contain ${scope}`)
  }

  const safe = assertRecord(bundle.safeStateSnapshot, 'bugBundle.safeStateSnapshot')
  const render = assertRecord(safe.render, 'bugBundle.safeStateSnapshot.render')
  const deterministic = assertRecord(safe.deterministic, 'bugBundle.safeStateSnapshot.deterministic')
  const domain = assertRecord(deterministic.domain, 'bugBundle.safeStateSnapshot.deterministic.domain')
  const definition = assertRecord(domain.definition, 'bugBundle.safeStateSnapshot.deterministic.domain.definition')
  assert.equal(render.version, 1, 'bugBundle render version')
  assert.equal(deterministic.version, 1, 'bugBundle deterministic version')
  assert.equal(render.contentVersion, expected.contentVersion, 'bugBundle render contentVersion')
  assert.equal(deterministic.contentVersion, expected.contentVersion, 'bugBundle deterministic contentVersion')
  assert.equal(definition.contentVersion, expected.contentVersion, 'bugBundle definition contentVersion')
  assert.equal(definition.seed, expected.randomSeed, 'bugBundle definition seed')
  assertNonNegativeInteger(render.tick, 'bugBundle render tick')
  assert.equal(render.tick, domain.tick, 'bugBundle render/deterministic tick')
  assertNonNegativeInteger(render.randomState, 'bugBundle render randomState')
  assert.equal(render.randomState, domain.randomState, 'bugBundle render/deterministic randomState')
  assert(Array.isArray(render.actors) && render.actors.length === 2, 'bugBundle render must contain two actors')
  assert.match(safe.stateHash, /^[0-9a-f]{8}$/, 'bugBundle stateHash format')
  assert.equal(safe.stateHash, stableHashForVerification(deterministic), 'bugBundle stateHash')
  assert.match(bundle.screenshot, /^data:image\/png;base64,/, 'bugBundle screenshot prefix')
  return bundle
}

export function commitFileSet(entries, options = {}) {
  assert(Array.isArray(entries) && entries.length > 0, 'baseline transaction requires entries')
  const fsApi = options.fs ?? fs
  const transactionId = String(options.transactionId ?? `${process.pid}-${Date.now()}`)
    .replaceAll(/[^A-Za-z0-9_-]/g, '_')
  const destinations = new Set()
  const records = entries.map((entry) => {
    assert.equal(typeof entry.destination, 'string', 'baseline destination must be a string')
    assert(Buffer.isBuffer(entry.bytes) || entry.bytes instanceof Uint8Array, 'baseline bytes must be binary')
    assert(!destinations.has(entry.destination), `duplicate baseline destination: ${entry.destination}`)
    destinations.add(entry.destination)
    return {
      destination: entry.destination,
      bytes: entry.bytes,
      staged: `${entry.destination}.staged-${transactionId}`,
      backup: `${entry.destination}.backup-${transactionId}`,
      backedUp: false,
      installed: false,
    }
  })

  const removeIfPresent = (file) => {
    if (fsApi.existsSync(file)) fsApi.rmSync(file, { force: true })
  }
  try {
    for (const record of records) {
      fsApi.mkdirSync(path.dirname(record.destination), { recursive: true })
      assert(!fsApi.existsSync(record.staged), `stale staged file exists: ${record.staged}`)
      assert(!fsApi.existsSync(record.backup), `stale backup file exists: ${record.backup}`)
      fsApi.writeFileSync(record.staged, record.bytes)
    }
    for (const record of records) {
      if (fsApi.existsSync(record.destination)) {
        fsApi.renameSync(record.destination, record.backup)
        record.backedUp = true
      }
    }
    for (const record of records) {
      fsApi.renameSync(record.staged, record.destination)
      record.installed = true
    }
  } catch (error) {
    const rollbackErrors = []
    for (const record of [...records].reverse()) {
      try {
        if (record.installed) removeIfPresent(record.destination)
        if (record.backedUp && fsApi.existsSync(record.backup)) {
          fsApi.renameSync(record.backup, record.destination)
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    for (const record of records) {
      try { removeIfPresent(record.staged) } catch (cleanupError) { rollbackErrors.push(cleanupError) }
      try { removeIfPresent(record.backup) } catch (cleanupError) { rollbackErrors.push(cleanupError) }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], `baseline transaction rollback failed: ${error.message}`)
    }
    throw error
  }

  for (const record of records) {
    removeIfPresent(record.staged)
    removeIfPresent(record.backup)
  }
}
