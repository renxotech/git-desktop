import * as Fs from 'fs/promises'
import * as Path from 'path'
import { constants } from 'fs'
import ignore from 'ignore'
import {
  inventoryCleanupFiles,
  verifyOrdinaryDirectory,
} from './worktree-cleanup-files'

export interface ICleanupPolicy {
  readonly text: string | null
  readonly identity: string | null
}

/** Read only the selected root's ordinary policy file, without following links. */
export async function readCleanupPolicy(root: string): Promise<ICleanupPolicy> {
  await verifyOrdinaryDirectory(root)
  const path = Path.join(root, '.safe_to_remove')
  let before: Awaited<ReturnType<typeof Fs.lstat>>
  try {
    before = await Fs.lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { text: null, identity: null }
    }
    throw error
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size > 1024 * 1024
  ) {
    throw new Error(
      '.safe_to_remove must be an ordinary file no larger than 1 MiB.'
    )
  }
  const fingerprint = (stat: typeof before) =>
    `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
  const handle = await Fs.open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  )
  try {
    if (fingerprint(await handle.stat()) !== fingerprint(before)) {
      throw new Error('.safe_to_remove changed while being read.')
    }
    const text = await handle.readFile('utf8')
    const after = await Fs.lstat(path)
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      fingerprint(after) !== fingerprint(before)
    ) {
      throw new Error('.safe_to_remove changed while being read.')
    }
    return { text, identity: fingerprint(before) }
  } finally {
    await handle.close()
  }
}

/** Match only already-classified untracked/ignored paths, never tracked changes. */
export async function partitionDisposablePaths(
  root: string,
  repository: string,
  paths: ReadonlyArray<string>,
  policy: ICleanupPolicy
): Promise<{
  readonly disposable: ReadonlyArray<string>
  readonly remaining: ReadonlyArray<string>
}> {
  if (policy.text === null) {
    return { disposable: [], remaining: paths }
  }
  const matcher = ignore({ ignorecase: false }).add(policy.text)
  const disposable: string[] = []
  const remaining: string[] = []
  for (const path of paths) {
    const absolute = Path.resolve(repository, path)
    const relative = Path.relative(root, absolute)
    const repositoryRelative = Path.relative(repository, absolute)
    if (
      !relative ||
      Path.isAbsolute(relative) ||
      relative === '..' ||
      relative.startsWith(`..${Path.sep}`) ||
      !repositoryRelative ||
      Path.isAbsolute(repositoryRelative) ||
      repositoryRelative === '..' ||
      repositoryRelative.startsWith(`..${Path.sep}`)
    ) {
      throw new Error('Invalid disposable file path.')
    }
    // Git status can report descendants of a Windows junction. Resolve only
    // ordinary lexical ancestors; the first link is the complete removable
    // entry. Never lstat, inventory or match its target's descendants.
    await verifyOrdinaryDirectory(repository)
    let candidate = repository
    let stat: Awaited<ReturnType<typeof Fs.lstat>> | null = null
    for (const component of Path.relative(repository, absolute).split(
      Path.sep
    )) {
      candidate = Path.join(candidate, component)
      stat = await Fs.lstat(candidate)
      if (stat.isSymbolicLink()) {
        break
      }
      if (candidate !== absolute) {
        await verifyOrdinaryDirectory(candidate)
      }
    }
    if (stat === null) {
      throw new Error('Invalid disposable file path.')
    }
    const leaf = candidate
    const inventory =
      stat.isDirectory() && !stat.isSymbolicLink()
        ? await inventoryCleanupFiles(leaf)
        : [{ path: '', kind: stat.isSymbolicLink() ? 'link' : 'file' }]
    const parents = new Set(
      inventory
        .filter(entry => entry.path !== '')
        .map(entry => {
          const parent = Path.dirname(entry.path)
          return parent === '.' ? '' : parent
        })
    )
    const entries = inventory.filter(
      entry => entry.kind !== 'directory' || !parents.has(entry.path)
    )
    for (const entry of entries) {
      const name = Path.relative(root, Path.join(leaf, entry.path)).replace(
        /\\/g,
        '/'
      )
      const protectedPath = name
        .split('/')
        .some(part => part.toLowerCase() === '.git')
      const matches =
        !protectedPath &&
        (matcher.ignores(name + (entry.kind === 'directory' ? '/' : '')) ||
          (entry.kind === 'link' && matcher.ignores(`${name}/`)))
      const display = Path.relative(repository, Path.join(leaf, entry.path))
      if (matches) {
        disposable.push(display)
      } else {
        remaining.push(display)
      }
    }
  }
  return {
    disposable: [...new Set(disposable)].sort(),
    remaining: [...new Set(remaining)].sort(),
  }
}
