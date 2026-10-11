import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import ChildProcess from 'child_process'
import { launchWSL } from '../../src/lib/shells/wsl'

describe('WSL launcher', { skip: process.platform !== 'win32' }, () => {
  for (const [path, expectedPath] of [
    ['D:\\Projects\\repo', 'D:\\Projects\\repo'],
    [
      "D:\\Projects\\worktrees\\user's fix & 100% !important!",
      "D:\\Projects\\worktrees\\user's fix & 100% !important!",
    ],
    ['D:\\Projects\\literal %USERNAME%', 'D:\\Projects\\literal %USERNAME%'],
    ['D:\\', 'D:\\\\'],
    ['\\\\wsl.localhost\\Debian-WSL1\\home\\renxo\\repo', '/home/renxo/repo'],
    ['\\\\wsl$\\Debian-WSL1\\home\\renxo\\repo', '/home/renxo/repo'],
  ]) {
    it(`passes the exact checkout path to WSL: ${path}`, t => {
      const spawn = t.mock.method(
        ChildProcess,
        'spawn',
        () => new ChildProcess.ChildProcess()
      )
      launchWSL('C:\\Windows\\System32\\wsl.exe', path)
      assert.equal(spawn.mock.callCount(), 1)
      const [executable, args, options] = spawn.mock.calls[0]
        .arguments as unknown as [string, string[], ChildProcess.SpawnOptions]
      assert.match(executable, /cmd\.exe$/i)
      assert.deepEqual(args.slice(0, 4), ['/d', '/v:off', '/s', '/c'])
      assert.match(
        args[4],
        /--distribution Debian-WSL1 --cd "%GITHUB_DESKTOP_WSL_OPEN_PATH%"$/
      )
      assert.equal(options.env?.GITHUB_DESKTOP_WSL_OPEN_PATH, expectedPath)
      assert.equal(
        options.env?.GITHUB_DESKTOP_WSL_EXE,
        'C:\\Windows\\System32\\wsl.exe'
      )
      assert.equal(options.windowsVerbatimArguments, true)
      assert.ok(!args[4].includes(path))
      assert.equal(options.shell, undefined)
    })
  }
  it('does not start another distribution for a different WSL filesystem', t => {
    const spawn = t.mock.method(
      ChildProcess,
      'spawn',
      () => new ChildProcess.ChildProcess()
    )
    assert.throws(
      () => launchWSL('wsl.exe', '\\\\wsl$\\Ubuntu\\home\\repo'),
      /belongs to Ubuntu/
    )
    assert.equal(spawn.mock.callCount(), 0)
  })
})
