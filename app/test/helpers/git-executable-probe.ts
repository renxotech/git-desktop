import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir, chmod } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { once, EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { ProcessProxyConnection } from 'process-proxy'
import { createHooksProxy } from '../../src/lib/hooks/hooks-proxy'
import { getRepoHooks } from '../../src/lib/hooks/get-repo-hooks'
import {
  discoverInstalledGit,
  exec,
  spawn,
  getGitExecutable,
  getGitEnvironment,
  saveGitExecutableSelection,
} from '../../src/lib/git/executable'
import { ExecError } from 'dugite'

async function main() {
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  process.env.GIT_CONFIG_GLOBAL =
    process.platform === 'win32' ? 'NUL' : '/dev/null'
  const mode = process.argv[2]
  const path = await discoverInstalledGit()
  assert.ok(path)
  saveGitExecutableSelection(
    mode === 'bundled'
      ? { kind: 'bundled' }
      : {
          kind: 'installed',
          path:
            mode === 'missing'
              ? join(tmpdir(), 'nonexistent-desktop-git.exe')
              : path,
        }
  )
  if (mode === 'corrupt') {
    localStorage.setItem('git-executable-selection', 'broken json')
  }
  if (mode === 'missing' || mode === 'corrupt') {
    await assert.rejects(
      exec(['--version'], tmpdir()),
      /Preferences > Git > Executable/
    )
    await assert.rejects(
      spawn(['--version'], tmpdir()),
      /Preferences > Git > Executable/
    )
    return
  }
  const active = await getGitExecutable()
  assert.equal(active.selection.kind, mode)
  // Saving another choice cannot change a running operation/session.
  saveGitExecutableSelection(
    mode === 'bundled' ? { kind: 'installed', path } : { kind: 'bundled' }
  )
  assert.equal((await getGitExecutable()).path, active.path)
  const dir = await mkdtemp(join(tmpdir(), 'desktop-selected-git-'))
  const checked = async (args: string[]) => {
    const result = await exec(args, dir)
    assert.equal(result.exitCode, 0, result.stderr)
    return result.stdout
  }
  try {
    await checked(['init', '--template=', '.'])
    await checked(['config', 'user.name', 'Git Selection Test'])
    await checked(['config', 'user.email', 'git-selection@example.test'])
    await writeFile(join(dir, 'file.txt'), 'selected Git\n')
    await checked(['add', 'file.txt'])
    await checked(['-c', 'commit.gpgsign=false', 'commit', '-m', 'initial'])
    const blob = await exec(['hash-object', '--stdin'], dir, {
      stdin: Buffer.from('binary\0data'),
      encoding: 'buffer',
    })
    assert.ok(Buffer.isBuffer(blob.stdout))
    assert.equal(blob.exitCode, 0)
    const expected = await checked(['rev-parse', 'HEAD'])
    const child = await spawn(['rev-parse', 'HEAD'], dir)
    assert.equal(child.spawnfile, active.path)
    const chunks: Buffer[] = []
    child.stdout.on('data', chunk => chunks.push(chunk))
    const [code] = await once(child, 'close')
    assert.equal(code, 0)
    assert.equal(Buffer.concat(chunks).toString(), expected)
    let spawnedPath: string | undefined
    await exec(['--version'], dir, {
      processCallback: child => {
        spawnedPath = child.spawnfile
      },
    })
    assert.equal(spawnedPath, active.path)
    const failed = await exec(['rev-parse', '--verify', 'nonexistent-ref'], dir)
    assert.notEqual(failed.exitCode, 0)
    await assert.rejects(
      exec(['--version'], dir, { maxBuffer: 1 }),
      error =>
        error instanceof ExecError &&
        error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
    )
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      exec(['--version'], dir, { signal: controller.signal }),
      error => error instanceof ExecError && error.code === 'ABORT_ERR'
    )
    const environment = await getGitEnvironment({ GIT_EXEC_PATH: '/wrong' })
    assert.equal(environment.gitLocation, active.path)
    assert.equal(environment.env.GIT_EXEC_PATH, active.execPath)
    // No external server: exercise fetch/push against another disposable local repo.
    await checked(['init', '--bare', 'remote.git'])
    await checked(['remote', 'add', 'origin', join(dir, 'remote.git')])
    await checked(['push', 'origin', 'HEAD:refs/heads/main'])
    await checked(['fetch', 'origin'])
    await checked(['worktree', 'add', '--detach', 'linked'])
    assert.match(
      await checked(['worktree', 'list', '--porcelain', '-z']),
      /linked/
    )
    // Exercise the application's hook proxy and nested `git` resolution, not
    // just the low-level runner. A loaded shell may have a different Git PATH.
    await mkdir(join(dir, '.git/hooks'), { recursive: true })
    const hook = join(dir, '.git/hooks/pre-commit')
    await writeFile(hook, '#!/bin/sh\ngit --version >&2\n')
    await chmod(hook, 0o755)
    const hooks: string[] = []
    for await (const hook of getRepoHooks(dir, ['pre-commit'])) {
      hooks.push(hook)
    }
    assert.deepEqual(hooks, ['pre-commit'])
    const stderr = new PassThrough()
    const stdin = new PassThrough()
    stdin.end()
    let output = ''
    stderr.on('data', chunk => {
      output += chunk.toString()
    })
    let hookExitCode: number | undefined
    const connection = Object.assign(new EventEmitter(), {
      getArgs: async () => ['pre-commit'],
      getEnv: async () => ({}),
      getCwd: async () => dir,
      isStdinConnected: async () => false,
      exit: async (code: number) => {
        hookExitCode = code
      },
      stdin,
      stderr,
    }) as unknown as ProcessProxyConnection
    await createHooksProxy(
      async () => ({ kind: 'success', env: process.env }),
      dir
    )(connection)
    assert.equal(hookExitCode, 0, output)
    assert.ok(output.includes(`git version ${active.version}`), output)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('Git executable probe passed'),
  error => {
    console.error(error)
    process.exitCode = 1
  }
)
