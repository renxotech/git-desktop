import * as Fs from 'fs/promises'
import * as Path from 'path'
import { createHash } from 'crypto'
import { constants } from 'fs'
import {
  ICleanupEntry,
  inventoryCleanupFiles,
  verifyOrdinaryDirectory,
} from './worktree-cleanup-files'

export interface IMetadataSnapshot {
  readonly original: string
  readonly entries: ReadonlyArray<ICleanupEntry & { readonly sha256?: string }>
}

/** Fingerprint all private metadata, including loose objects, packs and reflogs. */
export async function snapshotCleanupMetadata(
  original: string
): Promise<IMetadataSnapshot> {
  const entries = await inventoryCleanupFiles(original)
  if (entries.some(entry => entry.kind === 'link')) {
    throw new Error('Linked Git metadata cannot be safely archived.')
  }
  const result: Array<ICleanupEntry & { readonly sha256?: string }> = []
  for (const entry of entries) {
    if (entry.kind !== 'file') {
      result.push(entry)
      continue
    }
    const path = Path.join(original, entry.path)
    await verifyOrdinaryDirectory(Path.dirname(path))
    const handle = await Fs.open(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    )
    try {
      const stat = await handle.stat()
      if (
        !stat.isFile() ||
        `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` !==
          entry.identity
      ) {
        throw new Error('Git metadata changed before archival fingerprinting.')
      }
      const hash = createHash('sha256')
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        hash.update(chunk)
      }
      result.push({ ...entry, sha256: hash.digest('hex') })
    } finally {
      await handle.close()
    }
  }
  if (
    JSON.stringify(entries) !==
    JSON.stringify(await inventoryCleanupFiles(original))
  ) {
    throw new Error('Git metadata changed while being fingerprinted.')
  }
  return { original, entries: result }
}

/** Verify the archive byte-for-byte before deleting any checkout entries. */
export async function verifyCleanupMetadata(
  snapshot: IMetadataSnapshot,
  saved: string
): Promise<void> {
  const actual = await snapshotCleanupMetadata(saved)
  if (JSON.stringify(snapshot.entries) !== JSON.stringify(actual.entries)) {
    throw new Error(
      'The retained Git metadata archive is incomplete or changed; checkout removal is blocked.'
    )
  }
}
