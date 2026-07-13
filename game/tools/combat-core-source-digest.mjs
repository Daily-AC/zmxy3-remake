import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pathspecs = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.package.json',
  'game/package.json',
  'game/index.html',
  'game/tsconfig.json',
  'packages/**',
  'game/src/**',
  'game/tools/**',
  'game/tests/**',
  'game/vite.config.ts',
]

export function sortUtf8Paths(paths) {
  return [...paths].sort((left, right) => Buffer.compare(
    Buffer.from(left, 'utf8'),
    Buffer.from(right, 'utf8'),
  ))
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr?.toString() || `git ${args.join(' ')} failed`)
  return result.stdout
}

export function combatCoreSourceDigest() {
  const listed = git(['ls-files', '-z', '--', ...pathspecs], { encoding: 'buffer' })
  const files = sortUtf8Paths(listed.toString('utf8').split('\0').filter(Boolean)
    .filter((file) => !file.startsWith('docs/reports/evidence/') && !file.startsWith('tmp/'))
  )
  assert(files.length > 0, 'combat core source digest resolved no tracked files')

  const digest = createHash('sha256')
  const entries = files.map((file) => {
    const blobId = git(['hash-object', `--path=${file}`, file]).trim()
    assert.match(blobId, /^[0-9a-f]{40}$/)
    digest.update(file)
    digest.update('\0')
    digest.update(blobId)
    digest.update('\0')
    return { path: file, blobId }
  })
  return { algorithm: 'sha256-git-clean-filter-v1', digest: digest.digest('hex'), entries }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = combatCoreSourceDigest()
  console.log(JSON.stringify({ algorithm: result.algorithm, digest: result.digest, fileCount: result.entries.length }))
}
