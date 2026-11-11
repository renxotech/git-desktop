import * as Path from 'path'
import { lstat, readdir, readFile, realpath } from 'fs/promises'
import { createHash } from 'crypto'
import { git } from './git/core'
import { listWorktrees } from './git/worktree'

export interface IArtifactRule {
  readonly path: string
  readonly kind: 'output' | 'dependencies' | 'cache'
}
export interface IArtifactConfig {
  readonly version: 1
  readonly keepHours: number
  readonly artifacts: ReadonlyArray<IArtifactRule>
}
export interface IArtifactCandidate {
  readonly root: string
  readonly path: string
  readonly kind: IArtifactRule['kind']
  readonly bytes: number
  readonly newest: number
  readonly fingerprint: string
  readonly reason: string | null
}
export interface IArtifactPlan {
  readonly repository: string
  readonly hours: number
  readonly cutoff: number
  readonly configs: ReadonlyArray<{
    readonly root: string
    readonly text: string | null
  }>
  readonly candidates: ReadonlyArray<IArtifactCandidate>
}

function safePath(path: string) {
  const parts = path.split(/[\\/]/)
  if (
    !path ||
    Path.isAbsolute(path) ||
    /^[a-z]:/i.test(path) ||
    parts.some(
      p =>
        !p ||
        p === '.' ||
        p === '..' ||
        /[:*?<>|]/.test(p) ||
        /[. ]$/.test(p) ||
        (p.startsWith('.') &&
          p !== '.next' &&
          p !== '.dart_tool' &&
          p !== '.gradle')
    )
  ) {
    throw new Error(`Unsafe artifact path: ${path}`)
  }
  if (
    parts.some(p =>
      [
        '.git',
        'assets',
        'packages',
        'projectsettings',
        'src',
        'source',
        'gradle',
        '.worktrees',
      ].includes(p.toLowerCase())
    )
  ) {
    throw new Error(`Protected artifact path: ${path}`)
  }
  return path.replace(/\\/g, '/')
}

/** Validate project data without executing project code. */
export function parseArtifactConfig(text: string): IArtifactConfig {
  const value = JSON.parse(text)
  if (
    value.version !== 1 ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length > 200
  ) {
    throw new Error(
      'Expected version 1 and an artifacts array (maximum 200 paths).'
    )
  }
  const keepHours = value.keepHours ?? 24
  if (
    typeof keepHours !== 'number' ||
    !Number.isFinite(keepHours) ||
    keepHours < 0
  ) {
    throw new Error('Keep hours must be a finite nonnegative number.')
  }
  const artifacts: IArtifactRule[] = value.artifacts.map(
    (rule: IArtifactRule) => {
      if (
        typeof rule?.path !== 'string' ||
        !['output', 'dependencies', 'cache'].includes(rule.kind)
      ) {
        throw new Error(
          'Each artifact needs a relative path and output, dependencies or cache kind.'
        )
      }
      return { path: safePath(rule.path), kind: rule.kind }
    }
  )
  for (const a of artifacts) {
    if (
      artifacts.some(
        b =>
          a !== b &&
          (a.path.toLowerCase() === b.path.toLowerCase() ||
            a.path.toLowerCase().startsWith(b.path.toLowerCase() + '/'))
      )
    ) {
      throw new Error('Artifact paths must not overlap.')
    }
  }
  return { version: 1, keepHours, artifacts }
}

/** Read per-checkout configuration, or suggest common local artifacts. */
export async function suggestArtifactConfig(root: string): Promise<string> {
  try {
    const file = Path.join(root, '.gitdesktop-cleanup.json')
    if ((await lstat(file)).isSymbolicLink()) {
      throw new Error('Cleanup configuration must not be a link.')
    }
    const text = await readFile(file, 'utf8')
    parseArtifactConfig(text)
    return text
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  const artifacts: IArtifactRule[] = []
  let visited = 0
  const add = (path: string, kind: IArtifactRule['kind']) =>
    artifacts.push({ path, kind })
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (++visited > 300) {
      throw new Error(
        'Project discovery limit reached. Supply .gitdesktop-cleanup.json with explicit paths.'
      )
    }
    const entries = await readdir(Path.join(root, directory), {
      withFileTypes: true,
    })
    const names = new Set(entries.map(e => e.name))
    const prefix = directory ? directory + '/' : ''
    if (names.has('package.json')) {
      add(prefix + 'node_modules', 'dependencies')
      for (const name of ['dist', 'build', 'out', '.next']) {
        if (names.has(name)) {
          add(prefix + name, 'output')
        }
      }
    }
    if (
      names.has('pubspec.yaml') &&
      (
        await readFile(Path.join(root, directory, 'pubspec.yaml'), 'utf8')
      ).includes('flutter:')
    ) {
      add(prefix + 'build', 'output')
      add(prefix + '.dart_tool', 'cache')
    } else if (names.has('build.gradle') || names.has('build.gradle.kts')) {
      add(prefix + 'build', 'output')
    }
    if (names.has('Assets') && names.has('ProjectSettings')) {
      add(prefix + 'Library', 'cache')
      add(prefix + 'Temp', 'cache')
    }
    // Go output paths are project-specific; configuration intentionally supplies them.
    if (depth < 3) {
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          ![
            'node_modules',
            'dist',
            'build',
            'out',
            'Library',
            'Temp',
            'Assets',
            'Packages',
            'vendor',
          ].includes(entry.name)
        ) {
          const sub = prefix + entry.name
          if (!(await exists(Path.join(root, sub, '.git')))) {
            await visit(sub, depth + 1)
          }
        }
      }
    }
  }
  await visit('', 0)
  const unique = artifacts.filter(
    (a, i) => artifacts.findIndex(b => b.path === a.path) === i
  )
  return JSON.stringify(
    { version: 1, keepHours: 24, artifacts: unique },
    null,
    2
  )
}
async function exists(path: string) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function inspect(
  root: string,
  rule: IArtifactRule,
  cutoff: number,
  cancelled: () => boolean = () => false
): Promise<IArtifactCandidate> {
  let bytes = 0
  let newest = 0
  const hash = createHash('sha256')
  let reason: string | null = null
  try {
    safePath(rule.path)
    if (Path.resolve(await realpath(root)) !== Path.resolve(root)) {
      throw new Error('Worktree root is a link or junction.')
    }
    const parts = rule.path.split('/')
    for (let i = 1; i <= parts.length; i++) {
      const path = Path.join(root, ...parts.slice(0, i))
      const stat = await lstat(path)
      if (
        stat.isSymbolicLink() ||
        Path.resolve(await realpath(path)) !== Path.resolve(path)
      ) {
        throw new Error('Links and junctions are protected.')
      }
    }
    const tracked = await git(
      ['--literal-pathspecs', 'ls-files', '-z', '--', rule.path],
      root,
      'artifactTrackedCheck'
    )
    if (tracked.stdout.length) {
      throw new Error('Contains tracked or staged files.')
    }
    const ignored = await git(
      ['check-ignore', '-q', '--', rule.path],
      root,
      'artifactIgnoreCheck',
      { successExitCodes: new Set([0, 1]) }
    )
    if (ignored.exitCode !== 0) {
      throw new Error('Path must be ignored by Git before cleanup.')
    }
    const walk = async (path: string): Promise<void> => {
      if (cancelled()) {
        throw new Error('Scan cancelled.')
      }
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error('Contains a link or special file.')
      }
      const relative = Path.relative(root, path)
      newest = Math.max(newest, stat.mtimeMs, stat.ctimeMs, stat.birthtimeMs)
      hash.update(
        JSON.stringify([
          relative,
          stat.size,
          stat.mtimeMs,
          stat.ctimeMs,
          stat.birthtimeMs,
          stat.ino,
        ])
      )
      if (stat.isDirectory()) {
        const names = (await readdir(path)).sort()
        if (
          names.includes('HEAD') &&
          names.includes('objects') &&
          names.includes('refs')
        ) {
          throw new Error('Contains a bare Git repository.')
        }
        if (
          names.some(
            n =>
              ['.git', '.gitdesktop-cleanup.json'].includes(n) ||
              n.startsWith('.env')
          )
        ) {
          throw new Error(
            'Contains a nested repository or cleanup configuration.'
          )
        }
        for (const name of names) {
          await walk(Path.join(path, name))
        }
      } else {
        bytes += stat.size
      }
    }
    await walk(Path.join(root, rule.path))
    if (!newest || newest >= cutoff) {
      reason = 'Preserved by retention period.'
    }
  } catch (error) {
    reason = String(error)
  }
  return {
    root,
    path: rule.path,
    kind: rule.kind,
    bytes,
    newest,
    fingerprint: hash.digest('hex'),
    reason,
  }
}

/** Build a preview for registered worktrees. Overrides are explicit user-reviewed rules. */
export async function previewArtifacts(
  repository: string,
  hours: number,
  overrides: ReadonlyMap<string, string>,
  kinds: ReadonlyArray<IArtifactRule['kind']>,
  cancelled: () => boolean = () => false
): Promise<IArtifactPlan> {
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error('Keep hours must be nonnegative.')
  }
  const cutoff = hours === 0 ? Infinity : Date.now() - hours * 3600000
  const candidates: IArtifactCandidate[] = []
  const configs: Array<{ root: string; text: string | null }> = []
  for (const tree of await listWorktrees(repository)) {
    if (cancelled()) {
      throw new Error('Scan cancelled.')
    }
    if (!overrides.has(tree.path)) {
      continue
    }
    if (tree.isLocked || tree.isPrunable) {
      candidates.push({
        root: tree.path,
        path: '',
        kind: 'output',
        bytes: 0,
        newest: 0,
        fingerprint: '',
        reason: 'Worktree is locked or unavailable.',
      })
      continue
    }
    const config = parseArtifactConfig(overrides.get(tree.path) ?? '')
    configs.push({ root: tree.path, text: await configSnapshot(tree.path) })
    for (const rule of config.artifacts.filter(a => kinds.includes(a.kind))) {
      candidates.push(await inspect(tree.path, rule, cutoff, cancelled))
    }
  }
  return { repository, hours, cutoff, configs, candidates }
}

/** Recheck every unit immediately before Git removes only that ignored path. */
export async function cleanArtifacts(
  plan: IArtifactPlan,
  cancelled: () => boolean = () => false
): Promise<ReadonlyArray<string>> {
  const results: string[] = []
  for (const candidate of plan.candidates.filter(c => c.reason === null)) {
    if (cancelled()) {
      results.push('Cancelled. Remaining folders preserved.')
      break
    }
    try {
      const config = plan.configs.find(c => c.root === candidate.root)
      if (!config || (await configSnapshot(candidate.root)) !== config.text) {
        throw new Error('Project configuration changed. Preview again.')
      }
      const trees = await listWorktrees(plan.repository)
      if (
        !trees.some(
          t => t.path === candidate.root && !t.isLocked && !t.isPrunable
        )
      ) {
        throw new Error('Worktree registration changed.')
      }
      const fresh = await inspect(candidate.root, candidate, plan.cutoff)
      if (fresh.reason || fresh.fingerprint !== candidate.fingerprint) {
        throw new Error(
          fresh.reason ?? 'Folder changed since preview. Preview again.'
        )
      }
      await git(
        ['--literal-pathspecs', 'clean', '-fdX', '--', candidate.path],
        candidate.root,
        'cleanArtifact'
      )
      if (await exists(Path.join(candidate.root, candidate.path))) {
        throw new Error('Some files could not be removed; folder remains.')
      }
      results.push(`Removed ${candidate.root}/${candidate.path}`)
    } catch (error) {
      results.push(
        `Skipped ${candidate.root}/${candidate.path}: ${String(error)}`
      )
    }
  }
  return results
}

async function configSnapshot(root: string): Promise<string | null> {
  const path = Path.join(root, '.gitdesktop-cleanup.json')
  if (!(await exists(path))) {
    return null
  }
  if ((await lstat(path)).isSymbolicLink()) {
    throw new Error('Configuration is a link.')
  }
  return readFile(path, 'utf8')
}
