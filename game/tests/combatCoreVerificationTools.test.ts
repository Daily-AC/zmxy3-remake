import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  combatCoreSourceDigest,
  sortUtf8Paths,
} from '../tools/combat-core-source-digest.mjs'
import { verifyWindowsPerformanceEvidence } from '../tools/verify-windows-performance-evidence.mjs'
import { stableHash } from '@zaixu/game-core'
import {
  assertCombatCoreBugBundle,
  commitFileSet,
  npmInvocation,
  stableHashForVerification,
  stripAnsi,
} from '../tools/combat-core-verification-lib.mjs'

const currentSourceDigest = combatCoreSourceDigest().digest

function validEvidence(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: 'PASS',
    sourceDigest: currentSourceDigest,
    testedGitCommit: '1'.repeat(40),
    simulationRuns: Array.from({ length: 3 }, () => ({
      actors: 51,
      warmupTicks: 120,
      measuredTicks: 600,
      p50Ms: 0.1,
      p95Ms: 0.2,
      maxMs: 0.3,
    })),
    browser: {
      work: { count: 600, p50Ms: 1, p95Ms: 2, maxMs: 3 },
      interval: {
        count: 600,
        p50Ms: 8,
        p95Ms: 9,
        maxMs: 20,
        droppedFrameCount: 1,
        droppedFrameRate: 1 / 600,
      },
    },
    environment: {
      platform: 'win32',
      chromiumVersion: '149.0.0.0',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      canvasBacking: { width: 960, height: 540 },
      canvasClient: { x: 0, y: 0, width: 1920, height: 1080 },
    },
  }
}

describe('combat core verification tools', () => {
  it('runs npm through node and npm-cli on Windows', () => {
    expect(npmInvocation(['run', 'build'], {
      platform: 'win32',
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      npmExecPath: null,
    })).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: [
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
        'run',
        'build',
      ],
    })
  })

  it('strips ANSI prefixes before parsing benchmark JSON', () => {
    expect(stripAnsi('\u001b[22m\u001b[39m{"actors":51}\u001b[0m')).toBe('{"actors":51}')
  })

  it('allows the Windows collector to use an installed Chromium executable', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'tools/verify-combat-core-slice.mjs'),
      'utf8',
    )
    expect(source).toContain('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH')
    expect(source).toContain("PLAYWRIGHT_ANGLE_BACKEND ?? 'swiftshader'")
    expect(source).toContain('`--use-angle=${angleBackend}`')
    expect(source).toContain("['--enable-unsafe-swiftshader'] : ['--enable-gpu']")
    expect(source).toContain('COLD_LOAD_TIMEOUT_MS = 45_000')
    expect(source).toContain('combat core hook did not become ready')
  })

  it.each([
    ['null', null],
    ['NaN', Number.NaN],
    ['string', '0.2'],
  ])('rejects a %s simulation percentile before threshold checks', (_label, value) => {
    const evidence = validEvidence() as {
      simulationRuns: Array<{ p95Ms: unknown }>
    }
    evidence.simulationRuns[0].p95Ms = value
    expect(() => verifyWindowsPerformanceEvidence(evidence)).toThrow(/p95Ms/)
  })

  it.each([
    ['null', null],
    ['NaN', Number.NaN],
    ['string', '2'],
  ])('rejects a %s browser metric before threshold checks', (_label, value) => {
    const evidence = validEvidence() as {
      browser: { work: { p50Ms: unknown } }
    }
    evidence.browser.work.p50Ms = value
    expect(() => verifyWindowsPerformanceEvidence(evidence)).toThrow(/work\.p50Ms/)
  })

  it('includes manifest and HTML dispatch inputs in stable UTF-8 byte order', () => {
    const first = combatCoreSourceDigest()
    const second = combatCoreSourceDigest()
    expect(second).toEqual(first)
    const paths = first.entries.map((entry) => entry.path)
    expect(paths).toContain('game/package.json')
    expect(paths).toContain('game/index.html')
    expect(paths).toEqual([...paths].sort((left, right) => Buffer.compare(
      Buffer.from(left, 'utf8'),
      Buffer.from(right, 'utf8'),
    )))
  })

  it('sorts case-sensitive paths by explicit UTF-8 bytes', () => {
    expect(sortUtf8Paths(['a/path', 'Z/path', 'A/path', 'z/path'])).toEqual([
      'A/path',
      'Z/path',
      'a/path',
      'z/path',
    ])
  })

  it('commits a staged baseline set and removes transaction files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-core-baseline-'))
    const first = path.join(directory, 'first.png')
    const second = path.join(directory, 'timeline.json')
    fs.writeFileSync(first, 'old-first')
    fs.writeFileSync(second, 'old-second')

    commitFileSet([
      { destination: first, bytes: Buffer.from('new-first') },
      { destination: second, bytes: Buffer.from('new-second') },
    ], { transactionId: 'success' })

    expect(fs.readFileSync(first, 'utf8')).toBe('new-first')
    expect(fs.readFileSync(second, 'utf8')).toBe('new-second')
    expect(fs.readdirSync(directory).sort()).toEqual(['first.png', 'timeline.json'])
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('restores every baseline when a rename fails mid-commit', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-core-baseline-'))
    const first = path.join(directory, 'first.png')
    const second = path.join(directory, 'second.png')
    fs.writeFileSync(first, 'old-first')
    fs.writeFileSync(second, 'old-second')
    let injected = false
    const failingFs = {
      ...fs,
      renameSync(source: fs.PathLike, destination: fs.PathLike): void {
        if (!injected && String(source).includes('.staged-') && destination === second) {
          injected = true
          throw new Error('injected rename failure')
        }
        fs.renameSync(source, destination)
      },
    }

    expect(() => commitFileSet([
      { destination: first, bytes: Buffer.from('new-first') },
      { destination: second, bytes: Buffer.from('new-second') },
    ], { fs: failingFs, transactionId: 'rollback' })).toThrow('injected rename failure')

    expect(fs.readFileSync(first, 'utf8')).toBe('old-first')
    expect(fs.readFileSync(second, 'utf8')).toBe('old-second')
    expect(fs.readdirSync(directory).sort()).toEqual(['first.png', 'second.png'])
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it.each([
    { b: 2, a: 1 },
    { nested: ['悟空', { tick: 42, alive: true }], nullable: null },
  ])('recomputes the game-core canonical stable hash for %#', (value) => {
    expect(stableHashForVerification(value)).toBe(stableHash(value))
  })

  it('validates exact bug-bundle versions, whiff semantics, checkpoint, and hash', () => {
    const expected = {
      gameVersion: '0.0.1',
      contentVersion: 'combat-core-slice@1',
      saveSchemaVersion: 'profile@1',
      protocolVersion: 'combat-session@1',
      presentationVersion: 'presentation@1',
      randomSeed: 0x5a17,
    }
    const deterministic = {
      version: 1,
      contentVersion: expected.contentVersion,
      domain: {
        tick: 4,
        randomState: 123,
        definition: { contentVersion: expected.contentVersion, seed: expected.randomSeed },
      },
      protocol: {},
    }
    const bundle = {
      schemaVersion: 1,
      ...expected,
      recentCommands: [{ actorId: 'hero-1', sequence: 1, atTick: 1, type: 'press-attack' }],
      domainEvents: [{ type: 'attack-started', tick: 1, sourceId: 'hero-1', action: 'hit1' }],
      presentationCues: [{
        presentationVersion: expected.presentationVersion,
        tick: 1,
        type: 'swing',
        payload: { actorId: 'hero-1', action: 'hit1', effect: 'hit1', sound: 'hit12' },
      }],
      safeStateSnapshot: {
        render: {
          version: 1,
          contentVersion: expected.contentVersion,
          tick: 4,
          randomState: 123,
          actors: [{ id: 'hero-1' }, { id: 'monster-1' }],
        },
        deterministic,
        stateHash: stableHashForVerification(deterministic),
      },
      structuredLogs: [
        { scope: 'command', event: 'press-attack', tick: 1 },
        { scope: 'domain', event: 'attack-started', tick: 1 },
        { scope: 'presentation', event: 'swing', tick: 1 },
        { scope: 'tick', event: 'advanced', tick: 1 },
      ],
      screenshot: 'data:image/png;base64,AA==',
      viewState: {},
      performance: {},
    }

    expect(() => assertCombatCoreBugBundle(bundle, expected)).not.toThrow()
    expect(() => assertCombatCoreBugBundle({ ...bundle, protocolVersion: 'wrong' }, expected))
      .toThrow(/protocolVersion/)
    expect(() => assertCombatCoreBugBundle({
      ...bundle,
      safeStateSnapshot: { ...bundle.safeStateSnapshot, stateHash: '00000000' },
    }, expected)).toThrow(/stateHash/)
  })
})
