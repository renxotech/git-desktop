import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { delimiter, dirname, join, resolve } from 'path'
import { readFile, readdir } from 'fs/promises'
import ts from 'typescript'
import {
  discoverInstalledGit,
  environmentForGit,
  isSupportedGitVersion,
  readGitExecutableSelection,
  saveGitExecutableSelection,
  validateGitExecutable,
} from '../../../src/lib/git/executable'

const run = promisify(execFile)
const root = resolve(__dirname, '../../../..')

describe('Git executable selection', () => {
  it('accepts supported versions and rejects old or non-Git output', () => {
    for (const version of [
      'git version 2.46.0',
      'git version 2.55.0.windows.5',
      'git version 3.0.0',
    ]) {
      assert.equal(isSupportedGitVersion(version), true)
    }
    for (const version of [
      'git version 2.45.9',
      'git version 1.99.0',
      'v24.0.0',
      'git version unknown',
    ]) {
      assert.equal(isSupportedGitVersion(version), false)
    }
  })

  it('persists an explicit selection and rejects corrupt settings', () => {
    localStorage.removeItem('git-executable-selection')
    assert.deepEqual(readGitExecutableSelection(), { kind: 'bundled' })
    saveGitExecutableSelection({ kind: 'installed', path: '/chosen/git' })
    assert.deepEqual(readGitExecutableSelection(), {
      kind: 'installed',
      path: '/chosen/git',
    })
    localStorage.setItem('git-executable-selection', '{"kind":"other"}')
    assert.throws(readGitExecutableSelection)
    localStorage.removeItem('git-executable-selection')
  })

  it('pins the helper directory and nested Git while preserving operation settings', () => {
    const path = resolve('chosen', 'git.exe')
    const execPath = resolve('chosen', 'libexec', 'git-core')
    const env = environmentForGit(
      { selection: { kind: 'installed', path }, path, execPath },
      {
        GIT_EXEC_PATH: '/wrong/override',
        GIT_CONFIG_PARAMETERS: "'credential.helper=desktop'",
        GIT_ASKPASS: '/desktop/askpass',
      },
      {
        Path: '/system',
        LOCAL_GIT_DIRECTORY: '/bundled',
        GIT_TEMPLATE_DIR: '/bundled/templates',
      }
    )
    assert.equal(env.GIT_EXEC_PATH, execPath)
    assert.equal(env.LOCAL_GIT_DIRECTORY, undefined)
    assert.equal(env.GIT_TEMPLATE_DIR, undefined)
    assert.equal(env.GIT_CONFIG_PARAMETERS, "'credential.helper=desktop'")
    assert.equal(env.GIT_ASKPASS, '/desktop/askpass')
    assert.equal((env.PATH ?? env.Path)?.split(delimiter)[0], dirname(path))
  })

  it('checks installed and bundled Git locally', async () => {
    const path = await discoverInstalledGit()
    assert.ok(
      path,
      'A Git installation is required for these integration tests'
    )
    const installed = await validateGitExecutable({ kind: 'installed', path })
    const bundled = await validateGitExecutable({ kind: 'bundled' })
    assert.equal(installed.path, path)
    assert.notEqual(installed.path, bundled.path)
    assert.ok(installed.version)
    assert.ok(bundled.execPath)
  })

  it('rejects relative, missing, and non-Git executables', async () => {
    await assert.rejects(
      validateGitExecutable({ kind: 'installed', path: 'git' }),
      /absolute path/
    )
    await assert.rejects(
      validateGitExecutable({
        kind: 'installed',
        path: resolve('missing-git.exe'),
      })
    )
    await assert.rejects(
      validateGitExecutable({ kind: 'installed', path: process.execPath }),
      /required/
    )
  })

  for (const mode of ['installed', 'bundled', 'missing', 'corrupt']) {
    it(`routes execution consistently with ${mode} selected`, async () => {
      const { stdout } = await run(
        process.execPath,
        [
          '--disable-warning=ExperimentalWarning',
          '--experimental-test-module-mocks',
          '--conditions=import',
          '--import',
          'tsx',
          '--import',
          './app/test/globals.mts',
          './app/test/helpers/git-executable-probe.ts',
          mode,
        ],
        { cwd: root, timeout: 30000 }
      )
      assert.match(stdout, /Git executable probe passed/)
    })
  }

  it('keeps dugite process launch and resolution APIs behind the shared runner', async () => {
    const src = join(root, 'app/src')
    for (const file of await readdir(src, { recursive: true })) {
      if (
        !/\.tsx?$/.test(file) ||
        file.replaceAll('\\', '/') === 'lib/git/executable.ts'
      ) {
        continue
      }
      const source = ts.createSourceFile(
        file,
        await readFile(join(src, file), 'utf8'),
        ts.ScriptTarget.Latest
      )
      for (const node of source.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteral(node.moduleSpecifier) ||
          node.moduleSpecifier.text !== 'dugite'
        ) {
          continue
        }
        const bindings = node.importClause?.namedBindings
        assert.ok(
          bindings && ts.isNamedImports(bindings),
          `Unrestricted dugite import in ${file}`
        )
        for (const element of bindings.elements) {
          const name = (element.propertyName ?? element.name).text
          assert.ok(
            ![
              'exec',
              'spawn',
              'resolveGitBinary',
              'setupEnvironment',
              'resolveGitDir',
              'resolveEmbeddedGitDir',
            ].includes(name),
            `${file} bypasses Git selection with ${name}`
          )
        }
      }
    }
  })
})
