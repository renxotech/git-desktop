import * as Path from 'path'
import { lstat, realpath, readFile, readlink } from 'fs/promises'
import { Repository } from '../../models/repository'
import { git } from './core'
import { createLogParser } from './git-delimiter-parser'
import { getChangedFiles } from './log'
import { AppFileStatusKind } from '../../models/status'

export interface IFileRevision {
  readonly sha: string
  readonly shortSha: string
  readonly subject: string
  readonly body: string
  readonly author: string
  readonly date: string
  readonly committerDate: string
  readonly parents: ReadonlyArray<string>
  readonly path: string
  readonly parentPath: string
}
export interface IFileEndpoint {
  readonly revision: string | null
  readonly path: string
}
export interface IFileSnapshot {
  readonly contents: Buffer | null
  readonly mode: string
  readonly modified?: number
}
export interface IFileInventory {
  readonly head: string | null
  readonly paths: ReadonlyArray<string>
  readonly dirty: ReadonlySet<string>
  readonly historyPaths: ReadonlyMap<string, string>
}
const literal = (path: string) => `:(top,literal)${path}`
export async function loadFileInventory(
  repository: Repository
): Promise<IFileInventory> {
  const ref = await git(
    ['rev-parse', '--verify', 'HEAD'],
    repository.path,
    'fileHistoryHead',
    { successExitCodes: new Set([0, 128]) }
  )
  const head = ref.exitCode === 0 ? ref.stdout.trim() : null
  const indexed = await git(
    ['ls-files', '-z'],
    repository.path,
    'fileHistoryIndex'
  )
  const committed =
    head === null
      ? ''
      : (
          await git(
            ['ls-tree', '-r', '--name-only', '-z', head],
            repository.path,
            'fileHistoryTree'
          )
        ).stdout
  const renames =
    head === null
      ? ''
      : (
          await git(
            ['diff', '--cached', '--name-status', '-z', '-M', head],
            repository.path,
            'fileHistoryRenames'
          )
        ).stdout
  const historyPaths = new Map<string, string>()
  const tokens = renames.split('\0')
  for (let i = 0; i < tokens.length - 1; ) {
    const status = tokens[i++]
    const oldPath = tokens[i++]
    if (status.startsWith('R') || status.startsWith('C')) {
      const newPath = tokens[i++]
      if (status.startsWith('R')) {
        historyPaths.set(newPath, oldPath)
      }
    }
  }
  const changed =
    head === null
      ? indexed.stdout
      : (
          await git(
            [
              'diff',
              '--no-renames',
              '--name-only',
              '-z',
              '--no-ext-diff',
              head,
            ],
            repository.path,
            'fileHistoryChanges'
          )
        ).stdout
  const staged =
    head === null
      ? ''
      : (
          await git(
            [
              'diff',
              '--cached',
              '--no-renames',
              '--name-only',
              '-z',
              '--no-ext-diff',
              head,
            ],
            repository.path,
            'fileHistoryStaged'
          )
        ).stdout
  return {
    head,
    historyPaths,
    paths: Array.from(
      new Set((indexed.stdout + committed).split('\0').filter(Boolean))
    ).sort(),
    dirty: new Set((changed + staged).split('\0').filter(Boolean)),
  }
}

/** History follows a single path; resolve each rename before proceeding to older rows. */
export async function loadFileRevisions(
  repository: Repository,
  head: string | null,
  path: string,
  limit: number
): Promise<ReadonlyArray<IFileRevision>> {
  if (head === null) {
    return []
  }
  const parser = createLogParser({
    sha: '%H',
    shortSha: '%h',
    subject: '%s',
    body: '%b',
    author: '%an',
    date: '%aI',
    committerDate: '%cI',
    parents: '%P',
  })
  const result = await git(
    [
      'log',
      '--follow',
      '--topo-order',
      `--max-count=${limit}`,
      '--no-show-signature',
      ...parser.formatArgs,
      head,
      '--',
      literal(path),
    ],
    repository.path,
    'fileHistoryLog'
  )
  const revisions: IFileRevision[] = []
  let currentPath = path
  for (const record of parser.parse(result.stdout)) {
    const changes = await getChangedFiles(repository, record.sha)
    const change = changes.files.find(file => file.path === currentPath)
    const parentPath =
      change?.status.kind === AppFileStatusKind.Renamed
        ? change.status.oldPath
        : currentPath
    revisions.push({
      ...record,
      parents: record.parents.split(' ').filter(Boolean),
      path: currentPath,
      parentPath,
    })
    currentPath = parentPath
  }
  return revisions
}

function within(root: string, target: string) {
  const relative = Path.relative(root, target)
  return (
    relative === '' ||
    (!Path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${Path.sep}`))
  )
}
/** Resolve intermediate links but never dereference a tracked symlink's final target. */
export async function readCurrentSnapshot(
  repository: Repository,
  path: string
): Promise<IFileSnapshot> {
  if (!path || Path.isAbsolute(path) || path.split(/[\\/]/).includes('..')) {
    throw new Error('File is outside the repository root')
  }
  const root = await realpath(repository.path)
  const target = Path.resolve(root, path)
  if (!within(root, target)) {
    throw new Error('File is outside the repository root')
  }
  // Verify each existing ancestor, also for deleted files beneath junctions.
  let ancestor = Path.dirname(target)
  while (true) {
    try {
      if (!within(root, await realpath(ancestor))) {
        throw new Error('File resolves outside the repository root')
      }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      const parent = Path.dirname(ancestor)
      if (parent === ancestor) {
        throw error
      }
      ancestor = parent
    }
  }
  try {
    const info = await lstat(target)
    if (info.isSymbolicLink()) {
      return {
        contents: Buffer.from(await readlink(target)),
        mode: '120000',
        modified: info.mtimeMs,
      }
    }
    if (info.isDirectory()) {
      return { contents: null, mode: '160000', modified: info.mtimeMs }
    }
    if (info.size > 70e6) {
      throw new Error('File is too large to preview')
    }
    if (!within(root, await realpath(target))) {
      throw new Error('File resolves outside the repository root')
    }
    return {
      contents: await readFile(target),
      mode: info.mode & 0o111 ? '100755' : '100644',
      modified: info.mtimeMs,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { contents: null, mode: 'absent' }
    }
    throw error
  }
}
export async function readFileSnapshot(
  repository: Repository,
  endpoint: IFileEndpoint
): Promise<IFileSnapshot> {
  if (endpoint.revision === null) {
    return readCurrentSnapshot(repository, endpoint.path)
  }
  const tree = await git(
    ['ls-tree', '-z', endpoint.revision, '--', literal(endpoint.path)],
    repository.path,
    'fileHistorySnapshotTree'
  )
  if (!tree.stdout) {
    return { contents: null, mode: 'absent' }
  }
  const header = tree.stdout.split('\t')[0].split(' ')
  if (header[0] === '160000') {
    return { contents: Buffer.from(header[2]), mode: header[0] }
  }
  const size = await git(
    ['cat-file', '-s', header[2]],
    repository.path,
    'fileHistoryBlobSize'
  )
  if (Number(size.stdout.trim()) > 70e6) {
    throw new Error('Historical file is too large to preview')
  }
  const contents = await git(
    ['cat-file', 'blob', header[2]],
    repository.path,
    'fileHistorySnapshotBlob',
    { encoding: 'buffer' }
  )
  return { contents: contents.stdout, mode: header[0] }
}

export interface IFileTreeRow {
  readonly path: string
  readonly depth: number
  readonly folder: boolean
}
/** Adapted from DesktopPlus file-tree.ts, PR 283 head 1f7efa98 (MIT, GitHub copyright; see LICENSE). */
export function buildHistoryTree(
  paths: ReadonlyArray<string>,
  collapsed: ReadonlySet<string>,
  filter: string
): ReadonlyArray<IFileTreeRow> {
  interface IHistoryTreeNode {
    folders: Map<string, IHistoryTreeNode>
    files: string[]
  }
  const root = new Map<string, IHistoryTreeNode>()
  const node = { folders: root, files: [] as string[] }
  for (const path of paths.filter(path =>
    path.toLowerCase().includes(filter.toLowerCase())
  )) {
    const parts = path.split('/')
    let parent = node
    for (const part of parts.slice(0, -1)) {
      let child = parent.folders.get(part)
      if (!child) {
        child = { folders: new Map(), files: [] }
        parent.folders.set(part, child)
      }
      parent = child
    }
    parent.files.push(path)
  }
  const rows: IFileTreeRow[] = []
  const walk = (parent: typeof node, prefix: string, depth: number) => {
    for (const [name, child] of Array.from(parent.folders).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const path = prefix + name
      rows.push({ path, depth, folder: true })
      if (filter || !collapsed.has(path)) {
        walk(child, path + '/', depth + 1)
      }
    }
    for (const path of parent.files.sort()) {
      rows.push({ path, depth, folder: false })
    }
  }
  walk(node, '', 0)
  return rows
}
