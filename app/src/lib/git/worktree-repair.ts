import * as Path from 'path'
import { readFile, readdir, lstat } from 'fs/promises'
import { git } from './core'
import { pathExists } from '../path-exists'

export interface IWorktreeLinkCheck {
  readonly name: string
  readonly recordedPath: string
  readonly actualPath: string | null
  readonly status: 'healthy' | 'repairable' | 'unresolved'
}

const samePath = (a: string, b: string) =>
  process.platform === 'win32'
    ? Path.resolve(a).toLowerCase() === Path.resolve(b).toLowerCase()
    : Path.resolve(a) === Path.resolve(b)

/** Check registrations without relying on the linked worktrees being usable. */
export async function checkWorktreeLinks(
  mainPath: string
): Promise<ReadonlyArray<IWorktreeLinkCheck>> {
  const result = await git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    mainPath,
    'checkWorktreeLinks'
  )
  const commonDir = result.stdout.trim()
  const metadataRoot = Path.join(commonDir, 'worktrees')
  if (!(await pathExists(metadataRoot))) {
    return []
  }
  const localRoot = Path.join(mainPath, '.worktrees')
  const localFolders = (await pathExists(localRoot))
    ? await readdir(localRoot, { withFileTypes: true })
    : []
  const checks: IWorktreeLinkCheck[] = []
  for (const entry of await readdir(metadataRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const adminDir = Path.join(metadataRoot, entry.name)
    const recordedGitFile = (
      await readFile(Path.join(adminDir, 'gitdir'), 'utf8')
    ).trim()
    const recordedPath = Path.dirname(recordedGitFile)
    const candidates = [
      recordedPath,
      ...localFolders
        .filter(f => f.isDirectory())
        .map(f => Path.join(localRoot, f.name)),
    ]
    const matches: string[] = []
    let healthy = false
    const seen = new Set<string>()
    for (const rawCandidate of candidates) {
      const candidate = Path.resolve(rawCandidate)
      const key =
        process.platform === 'win32' ? candidate.toLowerCase() : candidate
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      const gitFile = Path.join(candidate, '.git')
      if (!(await pathExists(gitFile))) {
        continue
      }
      if (!(await lstat(gitFile)).isFile()) {
        continue
      }
      const text = (await readFile(gitFile, 'utf8')).trim()
      if (!text.startsWith('gitdir: ')) {
        continue
      }
      const target = Path.resolve(candidate, text.substring(8))
      // A relocated registration must still identify this exact metadata entry.
      const oldCommonDir = Path.dirname(Path.dirname(target))
      const oldGitFile = Path.join(
        oldCommonDir,
        Path.relative(commonDir, Path.join(candidate, '.git'))
      )
      if (
        samePath(target, adminDir) ||
        (Path.basename(target) === entry.name &&
          !(await pathExists(target)) &&
          Path.basename(Path.dirname(target)) === 'worktrees' &&
          Path.basename(oldCommonDir) === Path.basename(commonDir) &&
          samePath(oldGitFile, recordedGitFile))
      ) {
        matches.push(candidate)
        healthy =
          samePath(target, adminDir) && samePath(gitFile, recordedGitFile)
      }
    }
    checks.push({
      name: entry.name,
      recordedPath,
      actualPath: matches.length === 1 ? matches[0] : null,
      status:
        matches.length !== 1
          ? 'unresolved'
          : healthy
          ? 'healthy'
          : 'repairable',
    })
  }
  return checks
}

export async function repairWorktreeLinks(
  mainPath: string
): Promise<ReadonlyArray<IWorktreeLinkCheck>> {
  // Recheck immediately before mutation; never prune or recreate registrations.
  const checks = await checkWorktreeLinks(mainPath)
  const paths = checks
    .filter(c => c.status === 'repairable')
    .map(c => c.actualPath!)
  if (paths.length > 0) {
    await git(['worktree', 'repair', ...paths], mainPath, 'repairWorktreeLinks')
  }
  return checkWorktreeLinks(mainPath)
}
