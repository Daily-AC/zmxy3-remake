import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(process.cwd(), '..')
const toolPath = path.resolve(process.cwd(), 'tools/capture-legacy-combat-slice.ts')
const viteNodePath = path.resolve(repoRoot, 'node_modules/vite-node/vite-node.mjs')
const approvedManifestPath = path.resolve(
  process.cwd(),
  'tests/fixtures/legacy-combat-slice-current-sources.json',
)

function runCapture(env: Record<string, string> = {}): string {
  return execFileSync(process.execPath, [viteNodePath, toolPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).trim()
}

describe('legacy combat capture approvals', () => {
  it('does not modify the approved source manifest by default', () => {
    const before = readFileSync(approvedManifestPath)
    const fixedTime = new Date('2001-01-01T00:00:00.000Z')
    utimesSync(approvedManifestPath, fixedTime, fixedTime)

    const output = runCapture()

    expect(readFileSync(approvedManifestPath)).toEqual(before)
    expect(statSync(approvedManifestPath).mtimeMs).toBe(fixedTime.getTime())
    expect(JSON.parse(output)).toMatchObject({ updated: false })
  })

  it('updates an injected manifest only with explicit approval', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'zaixu-capture-'))
    const manifestPath = path.join(directory, 'sources.json')
    writeFileSync(manifestPath, '{"stale":true}\n')
    try {
      const output = runCapture({
        ALLOW_SOURCE_MANIFEST_UPDATE: '1',
        LEGACY_COMBAT_SOURCE_MANIFEST_PATH: manifestPath,
      })

      expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toMatchObject({
        battleSceneSourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        oracleSourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      expect(JSON.parse(output)).toMatchObject({ updated: true, currentSourcesPath: manifestPath })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
