import { promises } from 'fs'
import * as Path from 'path'

/** Use physical filesystem entries throughout cleanup, including ASAR files. */
export const cleanupFs: typeof promises = process.versions.electron
  ? require('original-fs').promises
  : promises

export interface ICleanupEntry {
  readonly path: string
  readonly kind: 'directory' | 'file' | 'link'
  readonly identity: string
  readonly target?: string
}

function identity(stat: Awaited<ReturnType<typeof cleanupFs.lstat>>) {
  const object = `${stat.dev}:${stat.ino}:${stat.mode}:`
  // Directory times change when a now-absent temporary file was added/removed.
  // Exact child inventory detects new contents; identity detects replacement.
  return stat.isDirectory() && !stat.isSymbolicLink()
    ? object
    : `${object}${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
}

/** Reject link ancestors; optionally permit absent uninitialized directories. */
export async function verifyOrdinaryDirectory(
  path: string,
  allowMissing = false
): Promise<void> {
  const absolute = Path.resolve(path)
  const parent = Path.dirname(absolute)
  if (parent !== absolute) {
    await verifyOrdinaryDirectory(parent, allowMissing)
  }
  let stat: Awaited<ReturnType<typeof cleanupFs.lstat>>
  try {
    stat = await cleanupFs.lstat(absolute)
  } catch (error) {
    if (
      allowMissing === true &&
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return
    }
    throw error
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Cleanup requires an ordinary directory: ${absolute}`)
  }
  if (Path.resolve(await cleanupFs.realpath(absolute)) !== absolute) {
    throw new Error(`Cannot verify the cleanup directory: ${absolute}`)
  }
}

/** Inventory entries without following directory links or preserved metadata. */
export async function inventoryCleanupFiles(
  root: string,
  preserved: ReadonlyArray<string> = []
): Promise<ReadonlyArray<ICleanupEntry>> {
  await verifyOrdinaryDirectory(root)
  const entries: ICleanupEntry[] = []
  const visit = async (path: string): Promise<void> => {
    const stat = await cleanupFs.lstat(path)
    const kind = stat.isSymbolicLink()
      ? 'link'
      : stat.isDirectory()
      ? 'directory'
      : stat.isFile()
      ? 'file'
      : null
    if (kind === null) {
      throw new Error(`Unsupported filesystem entry prevents cleanup: ${path}`)
    }
    entries.push({
      path: Path.relative(root, path),
      kind,
      identity: identity(stat),
      ...(kind === 'link' ? { target: await cleanupFs.readlink(path) } : {}),
    })
    if (kind === 'directory' && !preserved.includes(path)) {
      await verifyOrdinaryDirectory(path)
      const names = (await cleanupFs.readdir(path)).sort()
      for (const name of names) {
        await visit(Path.join(path, name))
      }
    }
  }
  await visit(root)
  return entries
}

/** Delete only checked entries, using unlink/rmdir, never recursive removal. */
export async function removeCleanupFiles(
  root: string,
  entries: ReadonlyArray<ICleanupEntry>,
  preserved: ReadonlyArray<string>
): Promise<void> {
  for (const entry of [...entries].reverse()) {
    const path = Path.resolve(root, entry.path)
    if (preserved.includes(path)) {
      continue
    }
    await verifyOrdinaryDirectory(Path.dirname(path))
    const stat = await cleanupFs.lstat(path)
    if (entry.kind === 'directory') {
      // Child removals change directory times and size; its object identity must
      // still match and rmdir independently refuses any newly added contents.
      const objectIdentity = `${stat.dev}:${stat.ino}:${stat.mode}:`
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        !entry.identity.startsWith(objectIdentity)
      ) {
        throw new Error(`The cleanup directory changed: ${path}`)
      }
      await cleanupFs.rmdir(path)
    } else {
      if (identity(stat) !== entry.identity) {
        throw new Error(`The cleanup file or link changed: ${path}`)
      }
      // unlink removes a Windows junction/symlink entry, never its target.
      await cleanupFs.unlink(path)
    }
  }
}
