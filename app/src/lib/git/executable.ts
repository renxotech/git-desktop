import { execFile, spawn as spawnProcess } from 'child_process'
import { access, mkdtemp, rm } from 'fs/promises'
import { constants } from 'fs'
import { delimiter, dirname, isAbsolute, join, resolve } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'
import {
  ExecError,
  IGitExecutionOptions,
  IGitStringExecutionOptions,
  IGitBufferExecutionOptions,
  IGitResult,
  IGitStringResult,
  IGitBufferResult,
  IGitSpawnOptions,
  ignoreClosedInputStream,
  resolveGitBinary,
  setupEnvironment,
} from 'dugite'
import which from 'which'

const execFileAsync = promisify(execFile)
const SelectionKey = 'git-executable-selection'
export const MinimumGitVersion = '2.46.0'

export type GitExecutableSelection =
  | { readonly kind: 'bundled' }
  | { readonly kind: 'installed'; readonly path: string }

export interface IGitExecutable {
  readonly selection: GitExecutableSelection
  readonly path: string
  readonly version: string
  readonly execPath: string
  readonly lfsAvailable: boolean
}

export function readGitExecutableSelection(): GitExecutableSelection {
  const value = localStorage.getItem(SelectionKey)
  if (value === null) {
    return { kind: 'bundled' }
  }
  const selection = JSON.parse(value)
  if (
    selection.kind === 'bundled' ||
    (selection.kind === 'installed' && typeof selection.path === 'string')
  ) {
    return selection
  }
  throw new Error(
    'Invalid Git selection. Choose Git in Preferences > Git > Executable.'
  )
}

/** Changes apply on restart, never during an operation. */
export function saveGitExecutableSelection(selection: GitExecutableSelection) {
  localStorage.setItem(SelectionKey, JSON.stringify(selection))
}

export function isSupportedGitVersion(version: string): boolean {
  const match = /^git version (\d+)\.(\d+)\.(\d+)(?:[.\s-]|$)/.exec(version)
  return (
    match !== null &&
    (Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 46))
  )
}

/** Strip environment injected for the bundled distribution, including Windows aliases. */
function cleanEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const excluded = new Set([
    'LOCAL_GIT_DIRECTORY',
    'GIT_EXEC_PATH',
    'GIT_TEMPLATE_DIR',
    'PREFIX',
  ])
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => !excluded.has(key.toUpperCase()))
      .map(([key, value]) => [
        process.platform === 'win32' ? key.toUpperCase() : key,
        value,
      ])
  )
}

export function environmentForGit(
  git: Pick<IGitExecutable, 'selection' | 'path' | 'execPath'>,
  additional: NodeJS.ProcessEnv = {},
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  let env = cleanEnvironment({ ...base, ...additional })
  if (git.selection.kind === 'bundled') {
    env = setupEnvironment(
      { ...env, LOCAL_GIT_DIRECTORY: dirname(dirname(git.path)) },
      {}
    ).env
  }
  // Also pin commands invoked by Git itself, filters and hooks to this installation.
  const pathKey =
    Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
  const paths = [dirname(git.path)]
  if (process.platform === 'win32') {
    paths.push(
      resolve(git.execPath, '../../bin'),
      resolve(git.execPath, '../../../usr/bin')
    )
  }
  // This directory contains Desktop's credential helper, independent of the
  // selected Git's own helper directory. Never put bundled Git helpers on an
  // installed Git's PATH.
  paths.push(resolve(__dirname, 'desktop-trampoline'))
  env[pathKey] = [...paths, env[pathKey] ?? ''].join(delimiter)
  env.GIT_EXEC_PATH = git.execPath
  return env
}

/** Local-only probes in a disposable repository; never contacts a remote. */
export async function validateGitExecutable(
  selection: GitExecutableSelection
): Promise<IGitExecutable> {
  const path =
    selection.kind === 'installed'
      ? selection.path.trim()
      : resolveGitBinary(process.env.LOCAL_GIT_DIRECTORY)
  if (!isAbsolute(path)) {
    throw new Error('Choose an absolute path to the Git executable.')
  }
  await access(path, constants.X_OK)
  const env =
    selection.kind === 'bundled'
      ? setupEnvironment(
          { LOCAL_GIT_DIRECTORY: dirname(dirname(path)) },
          cleanEnvironment(process.env)
        ).env
      : cleanEnvironment(process.env)
  const probe = (args: string[], cwd = tmpdir(), probeEnv = env) =>
    execFileAsync(path, args, {
      cwd,
      env: probeEnv,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
  const { stdout: versionOutput } = await probe(['--version'])
  if (!isSupportedGitVersion(versionOutput.trim())) {
    throw new Error(
      `Git ${MinimumGitVersion} or newer is required (found ${
        versionOutput.trim() || 'unknown'
      }).`
    )
  }
  const { stdout } = await probe(['--exec-path'])
  const execPath = stdout.trim()
  if (!isAbsolute(execPath)) {
    throw new Error('Git returned an invalid helper directory.')
  }
  await access(execPath)
  // MinGit keeps remote helpers in mingw*/bin, while full Git installations
  // commonly put them in libexec/git-core. Both are on this runtime's PATH.
  const helperName = `git-remote-https${
    process.platform === 'win32' ? '.exe' : ''
  }`
  const helperPaths = [join(execPath, helperName)]
  if (process.platform === 'win32') {
    helperPaths.push(resolve(execPath, '../../bin', helperName))
  }
  await Promise.any(
    helperPaths.map(path => access(path, constants.X_OK))
  ).catch(() => {
    throw new Error(
      'This Git installation is missing its HTTPS transport helper. Choose a complete Git installation.'
    )
  })
  const candidate = {
    selection,
    path,
    version: versionOutput.trim().replace(/^git version /, ''),
    execPath,
  }
  const runtimeEnv = environmentForGit(candidate)
  // Compatibility checks must not be redirected into an inherited repository
  // or affected by global configuration, include files, templates or aliases.
  for (const key of Object.keys(runtimeEnv)) {
    if (
      /^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*)$/i.test(
        key
      )
    ) {
      delete runtimeEnv[key]
    }
  }
  runtimeEnv.GIT_CONFIG_NOSYSTEM = '1'
  runtimeEnv.GIT_CONFIG_GLOBAL =
    process.platform === 'win32' ? 'NUL' : '/dev/null'
  runtimeEnv.GIT_TERMINAL_PROMPT = '0'
  const dir = await mkdtemp(join(tmpdir(), 'desktop-git-check-'))
  try {
    // Do not run user templates/hooks or inspect an existing repository.
    await probe(['init', '--template=', dir], tmpdir(), runtimeEnv)
    await probe(
      ['status', '--porcelain=2', '-z', '--untracked-files=all'],
      dir,
      runtimeEnv
    )
    await probe(['worktree', 'list', '--porcelain', '-z'], dir, runtimeEnv)
    await probe(
      [
        '-c',
        'core.hooksPath=',
        'hook',
        'run',
        '--ignore-missing',
        'pre-commit',
      ],
      dir,
      runtimeEnv
    )
    await probe(['config', '--null', '--list'], dir, runtimeEnv)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  const lfsAvailable = await probe(
    ['lfs', 'version'],
    tmpdir(),
    runtimeEnv
  ).then(
    () => true,
    () => false
  )
  return { ...candidate, lfsAvailable }
}

export async function discoverInstalledGit(): Promise<string | null> {
  return which('git', { nothrow: true })
}

let activeGit: Promise<IGitExecutable> | undefined

/** One validated executable per renderer session. Failure never selects another Git. */
export function getGitExecutable(): Promise<IGitExecutable> {
  return (activeGit ??= Promise.resolve()
    .then(() => validateGitExecutable(readGitExecutableSelection()))
    .then(git => {
      log.info(`Using ${git.selection.kind} Git ${git.version} at ${git.path}`)
      return git
    })
    .catch(error => {
      throw new Error(
        `Git is unavailable: ${error.message} Choose an executable or the bundled fallback in Preferences > Git > Executable, then restart Git Desktop.`
      )
    }))
}

export async function getGitEnvironment(
  additional?: NodeJS.ProcessEnv,
  base?: NodeJS.ProcessEnv
) {
  const git = await getGitExecutable()
  return {
    gitLocation: git.path,
    env: environmentForGit(git, additional, base),
  }
}

// Keep dugite's result, stdin, cancellation, callback and ExecError contracts.
export function exec(
  args: string[],
  path: string,
  options?: IGitStringExecutionOptions,
  beforeSpawn?: () => void
): Promise<IGitStringResult>
export function exec(
  args: string[],
  path: string,
  options: IGitBufferExecutionOptions,
  beforeSpawn?: () => void
): Promise<IGitBufferResult>
export function exec(
  args: string[],
  path: string,
  options?: IGitExecutionOptions,
  beforeSpawn?: () => void
): Promise<IGitResult>
export async function exec(
  args: string[],
  path: string,
  options?: IGitExecutionOptions,
  beforeSpawn?: () => void
): Promise<IGitResult> {
  const { gitLocation, env } = await getGitEnvironment(options?.env)
  return new Promise((resolve, reject) => {
    // Selection validation can yield. Certify repository state only once that
    // asynchronous work is complete, with no yield before the native spawn.
    beforeSpawn?.()
    const child = execFile(
      gitLocation,
      args,
      {
        cwd: path,
        env,
        encoding:
          options?.encoding === 'buffer' ? null : options?.encoding ?? 'utf8',
        maxBuffer: options?.maxBuffer ?? Infinity,
        signal: options?.signal,
        killSignal: options?.killSignal,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error || typeof error.code === 'number') {
          resolve({
            stdout,
            stderr,
            exitCode: typeof error?.code === 'number' ? error.code : 0,
          })
        } else {
          reject(
            new ExecError(
              `Git (${gitLocation}): ${error.message}`,
              stdout,
              stderr,
              error
            )
          )
        }
      }
    )
    ignoreClosedInputStream(child)
    if (options?.stdin !== undefined) {
      if (options.stdinEncoding) {
        child.stdin?.end(options.stdin, options.stdinEncoding)
      } else {
        child.stdin?.end(options.stdin)
      }
    }
    options?.processCallback?.(child)
  })
}

export async function spawn(
  args: string[],
  path: string,
  options?: IGitSpawnOptions
) {
  const { gitLocation, env } = await getGitEnvironment(options?.env)
  const child = spawnProcess(gitLocation, args, {
    cwd: path,
    env,
    windowsHide: true,
  })
  ignoreClosedInputStream(child)
  return child
}
