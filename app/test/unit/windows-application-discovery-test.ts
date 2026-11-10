import assert from 'node:assert/strict'
import { before, describe, it, mock } from 'node:test'
import ChildProcess from 'child_process'
import { EventEmitter } from 'events'
import * as Path from 'path'

let availableEditors: typeof import('../../src/lib/editors/win32').getAvailableEditors
let availableShells: typeof import('../../src/lib/shells/win32').getAvailableShells
const existing = new Set<string>()

before(async () => {
  mock.module('registry-js', {
    namedExports: {
      enumerateKeys: () => [],
      enumerateValues: () => [],
      HKEY: {
        HKEY_CURRENT_USER: 1,
        HKEY_LOCAL_MACHINE: 2,
        HKEY_CLASSES_ROOT: 3,
      },
      RegistryValueType: { REG_SZ: 1, REG_EXPAND_SZ: 2 },
    },
  })
  mock.module('../../src/lib/path-exists.ts', {
    namedExports: {
      pathExists: async (path: string) => existing.has(path),
    },
  })
  mock.module('../../src/lib/is-git-on-path.ts', {
    namedExports: { findGitOnPath: async () => null },
  })
  availableEditors = (await import('../../src/lib/editors/win32'))
    .getAvailableEditors
  availableShells = (await import('../../src/lib/shells/win32'))
    .getAvailableShells
})

describe('Windows application discovery', () => {
  it('finds Windows Notepad and Notepad++ at conventional paths without uninstall registry entries', async () => {
    const previous = process.env.ProgramFiles
    process.env.ProgramFiles = 'D:/Applications'
    const notepad = Path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'notepad.exe'
    )
    const plus = Path.join(
      process.env.ProgramFiles,
      'Notepad++',
      'notepad++.exe'
    )
    existing.clear()
    existing.add(notepad)
    existing.add(plus)
    try {
      assert.deepEqual(await availableEditors(), [
        { editor: 'Windows Notepad', path: notepad },
        { editor: 'Notepad++', path: plus },
      ])
    } finally {
      if (previous === undefined) {
        delete process.env.ProgramFiles
      } else {
        process.env.ProgramFiles = previous
      }
    }
  })

  it('lists Command Prompt and modern WSL without requiring wslconfig.exe', async t => {
    existing.clear()
    const wsl = Path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'wsl.exe'
    )
    existing.add(wsl)
    const spawn = t.mock.method(ChildProcess, 'spawn', () => {
      const process = new EventEmitter()
      queueMicrotask(() => process.emit('exit', 0))
      return process as ChildProcess.ChildProcess
    })
    const shells = await availableShells()
    assert.ok(shells.some(shell => shell.shell === 'Command Prompt'))
    assert.ok(shells.some(shell => shell.shell === 'WSL'))
    assert.deepEqual(spawn.mock.calls[0].arguments, [
      wsl,
      ['--list', '--quiet'],
      { windowsHide: true },
    ])
  })
})
