import * as Fs from 'fs/promises'
import * as Path from 'path'
import { createHash } from 'crypto'
import { git } from './core'
import { ICleanupEntry } from './worktree-cleanup-files'

/**
 * Recognize repository-shaped committed data without trusting its name or Git
 * status. Every descendant must be an unchanged ordinary HEAD/index blob, or
 * a directory needed to contain those blobs. Extra local metadata stays blocked.
 */
export async function isCommittedRepositoryData(
  worktreePath: string,
  path: string,
  head: string,
  inventory: ReadonlyArray<ICleanupEntry>
): Promise<boolean> {
  const [tree, index, diff] = await Promise.all([
    git(
      [
        '--literal-pathspecs',
        'ls-tree',
        '-r',
        '-z',
        '--full-tree',
        head,
        '--',
        path,
      ],
      worktreePath,
      'checkCommittedRepositoryData'
    ),
    git(
      ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', path],
      worktreePath,
      'checkCommittedRepositoryIndex'
    ),
    git(
      [
        '--literal-pathspecs',
        'diff',
        '--quiet',
        '--no-ext-diff',
        '--ignore-submodules=none',
        head,
        '--',
        path,
      ],
      worktreePath,
      'checkCommittedRepositoryChanges',
      { successExitCodes: new Set([0, 1]) }
    ),
  ])
  if (diff.exitCode !== 0) {
    return false
  }
  const expected = new Map<
    string,
    { readonly mode: string; readonly sha: string }
  >()
  const directories = new Set([path])
  for (const record of tree.stdout.split('\0').filter(Boolean)) {
    const match =
      /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/.exec(
        record
      )
    if (!match) {
      return false
    }
    const name = Path.normalize(match[3])
    if (!name.startsWith(`${path}${Path.sep}`)) {
      return false
    }
    expected.set(name, { mode: match[1], sha: match[2] })
    for (
      let directory = Path.dirname(name);
      directory !== path;
      directory = Path.dirname(directory)
    ) {
      directories.add(directory)
    }
  }
  if (expected.size === 0) {
    return false
  }
  const indexed = index.stdout.split('\0').filter(Boolean)
  if (
    indexed.length !== expected.size ||
    indexed.some(record => {
      const match = /^(100644|100755) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(record)
      const blob = match && expected.get(Path.normalize(match[3]))
      return !match || !blob || match[1] !== blob.mode || match[2] !== blob.sha
    })
  ) {
    return false
  }
  const leaves = inventory.filter(entry =>
    entry.path.startsWith(`${path}${Path.sep}`)
  )
  let files = 0
  for (const entry of leaves) {
    if (entry.kind === 'directory') {
      if (!directories.has(entry.path)) {
        return false
      }
      continue
    }
    const blob = expected.get(entry.path)
    if (entry.kind !== 'file' || !blob) {
      return false
    }
    const contents = await Fs.readFile(Path.join(worktreePath, entry.path))
    const hash = createHash(blob.sha.length === 40 ? 'sha1' : 'sha256')
      .update(`blob ${contents.length}\0`)
      .update(contents)
      .digest('hex')
    if (hash !== blob.sha) {
      return false
    }
    files++
  }
  return files === expected.size
}
