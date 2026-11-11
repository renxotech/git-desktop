import assert from 'node:assert/strict'
import { before, describe, it, mock, type TestContext } from 'node:test'
import * as Fs from 'fs/promises'
import * as Path from 'path'
import { createHash } from 'crypto'
import * as dugite from 'dugite'
import { createTempDirectory } from '../../helpers/temp'

type ExecArgs = Parameters<typeof dugite.exec>
let intercept: ((args: ExecArgs) => Promise<void>) | undefined
const exec = async (...args: ExecArgs) => {
  await intercept?.(args)
  return dugite.exec(...args)
}
let check: typeof import('../../../src/lib/git/worktree-branch-removal').checkWorktreeBranchRemoval
let remove: typeof import('../../../src/lib/git/worktree-branch-removal').removeCheckedWorktreeAndBranch
let setup: typeof import('../../helpers/repositories').setupEmptyRepository

before(async () => {
  mock.module('dugite', { namedExports: { ...dugite, exec } })
  ;({
    checkWorktreeBranchRemoval: check,
    removeCheckedWorktreeAndBranch: remove,
  } = await import('../../../src/lib/git/worktree-branch-removal'))
  ;({ setupEmptyRepository: setup } = await import(
    '../../helpers/repositories'
  ))
})

async function run(path: string, ...args: string[]) {
  const result = await dugite.exec(args, path)
  assert.equal(result.exitCode, 0, `${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

async function fixture(t: TestContext, withSubmodule = false) {
  const repo = await setup(t)
  await Fs.writeFile(Path.join(repo.path, 'tracked.txt'), 'parent original\n')
  await Fs.writeFile(
    Path.join(repo.path, '.gitignore'),
    'node_modules/\ndist/\n'
  )
  await run(repo.path, 'add', '.')
  await run(repo.path, 'commit', '-m', 'base')
  if (withSubmodule) {
    const source = await setup(t)
    await Fs.writeFile(
      Path.join(source.path, 'module.txt'),
      'module original\n'
    )
    await run(source.path, 'add', '.')
    await run(source.path, 'commit', '-m', 'module base')
    await run(
      repo.path,
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      source.path,
      'module'
    )
    await run(repo.path, 'commit', '-am', 'add module')
  }
  const root = await createTempDirectory(t)
  const linked = Path.join(root, 'linked')
  await run(repo.path, 'worktree', 'add', '-b', 'finished', linked)
  if (withSubmodule) {
    await run(
      linked,
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'update',
      '--init'
    )
  }
  t.after(() => {
    intercept = undefined
  })
  return {
    repo,
    root,
    linked,
    module: Path.join(linked, 'module'),
    check: () => check(repo.path, 'refs/heads/finished', 'HEAD'),
    branch: () => run(repo.path, 'branch', '--list', 'finished'),
  }
}

async function exists(path: string) {
  return Fs.lstat(path).then(
    () => true,
    e => {
      if (e.code === 'ENOENT') {
        return false
      }
      throw e
    }
  )
}

async function commitRemovalPolicy(
  f: Awaited<ReturnType<typeof fixture>>,
  rules: string
) {
  await Fs.writeFile(Path.join(f.repo.path, '.safe_to_remove'), rules)
  await run(f.repo.path, 'add', '--', '.safe_to_remove')
  await run(f.repo.path, 'commit', '-m', 'declare disposable local paths')
  await run(f.linked, 'merge', 'master')
}

async function retainedModule(backup: string, original: string) {
  const originalPath = Path.resolve(original)
  const manifest = JSON.parse(
    await Fs.readFile(Path.join(backup, 'restore.json'), 'utf8')
  )
  const entry = manifest.metadata.find(
    (item: { original: string; saved: string }) =>
      originalPath === Path.resolve(item.original) ||
      originalPath.startsWith(`${Path.resolve(item.original)}${Path.sep}`)
  )
  assert(entry, 'restore manifest must locate the complete original metadata')
  return Path.join(
    backup,
    entry.saved,
    Path.relative(entry.original, originalPath)
  )
}

async function fileSnapshot(root: string): Promise<ReadonlyArray<string>> {
  const entries: string[] = []
  const visit = async (path: string): Promise<void> => {
    const stat = await Fs.lstat(path)
    const relative = Path.relative(root, path)
    if (stat.isSymbolicLink()) {
      entries.push(`${relative}:link:${await Fs.readlink(path)}`)
    } else if (stat.isDirectory()) {
      entries.push(`${relative}:directory`)
      for (const name of (await Fs.readdir(path)).sort()) {
        await visit(Path.join(path, name))
      }
    } else {
      entries.push(
        `${relative}:file:${createHash('sha256')
          .update(await Fs.readFile(path))
          .digest('hex')}`
      )
    }
  }
  await visit(root)
  return entries
}

async function junctionSubmoduleFixture(
  t: TestContext,
  retainAmbiguousMetadata = false
) {
  const f = await fixture(t, true)
  const moduleMetadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
  // Successful link-only fixtures have no ambiguous inactive owner in the
  // selected admin container. Keep setup-only private metadata intact outside
  // that container; separate regressions retain it to verify refusal.
  if (!retainAmbiguousMetadata) {
    await Fs.rename(
      moduleMetadata,
      Path.join(f.root, 'preserved-private-module-metadata')
    )
  }
  await Fs.unlink(Path.join(f.module, '.git'))
  await Fs.unlink(Path.join(f.module, 'module.txt'))
  await Fs.rmdir(f.module)
  const target = Path.join(f.repo.path, 'module')
  await Fs.symlink(target, f.module, 'junction')
  return { ...f, target, moduleMetadata }
}

async function committedRepositoryFixture(t: TestContext) {
  const f = await fixture(t)
  await Fs.cp(
    Path.resolve(__dirname, '../../fixtures/branch-prune-tests/_git'),
    Path.join(f.repo.path, 'test-data', '_git'),
    { recursive: true }
  )
  await Fs.writeFile(
    Path.join(f.repo.path, '.gitattributes'),
    'test-data/** -text\n'
  )
  await Fs.appendFile(
    Path.join(f.repo.path, '.gitignore'),
    'test-data/_git/local-ignored\n'
  )
  await run(
    f.repo.path,
    'add',
    '--force',
    '--',
    '.gitattributes',
    '.gitignore',
    'test-data'
  )
  await run(
    f.repo.path,
    'commit',
    '-m',
    'committed repository-shaped test data'
  )
  // Populate the selected tree from the actual commit, excluding source-only
  // empty directories which Git cannot retain.
  await run(f.linked, 'merge', 'master')
  return { ...f, data: Path.join(f.linked, 'test-data', '_git') }
}

describe('committed repository-shaped fixtures during worktree cleanup', () => {
  it('removes a clean committed copy of the actual branch-prune fixture', async t => {
    const f = await committedRepositoryFixture(t)
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    await remove(f.repo.path, confirmed)
    assert.equal(await exists(f.linked), false)
    assert.equal(await f.branch(), '')
    assert.equal(
      await exists(Path.join(f.repo.path, 'test-data', '_git', 'HEAD')),
      true
    )
  })

  for (const change of [
    'modified',
    'staged',
    'staged-new',
    'untracked',
    'ignored',
    'empty-directory',
  ]) {
    it(`blocks ${change} state inside committed repository-shaped data`, async t => {
      const f = await committedRepositoryFixture(t)
      const confirmed = await f.check()
      if (change === 'modified' || change === 'staged') {
        await Fs.writeFile(
          Path.join(f.data, 'HEAD'),
          'ref: refs/heads/local-work\n'
        )
        if (change === 'staged') {
          await run(f.linked, 'add', '--', 'test-data/_git/HEAD')
        }
      } else if (change === 'empty-directory') {
        await Fs.mkdir(Path.join(f.data, 'local-empty'))
      } else {
        const extra = change === 'ignored' ? 'local-ignored' : 'local-extra'
        await Fs.writeFile(
          Path.join(f.data, extra),
          'local fixture work must survive'
        )
        if (change === 'staged-new') {
          await run(f.linked, 'add', '--', `test-data/_git/${extra}`)
        }
      }
      await assert.rejects(f.check(), /Nested bare repository prevents cleanup/)
      await assert.rejects(
        remove(f.repo.path, confirmed, true),
        /Nested bare repository prevents cleanup/
      )
      assert.equal(await exists(f.linked), true)
      assert.match(await f.branch(), /finished/)
    })
  }

  for (const ignored of [false, true]) {
    it(`rejects a genuine ${
      ignored ? 'ignored' : 'untracked'
    } bare repository`, async t => {
      const f = await fixture(t)
      const bare = Path.join(f.linked, ignored ? 'dist' : 'local-bare')
      await run(f.linked, 'init', '--bare', '--', bare)
      await assert.rejects(f.check(), /Nested bare repository prevents cleanup/)
      assert.equal(await exists(Path.join(bare, 'HEAD')), true)
      assert.match(await f.branch(), /finished/)
    })
  }
})

describe('safe worktree removal with real filesystem fixtures', () => {
  it('blocks ambiguous inactive metadata through a junction for stale and external-live stores', async t => {
    for (const externallyLive of [false, true]) {
      const f = await junctionSubmoduleFixture(t, true)
      if (externallyLive) {
        await Fs.unlink(Path.join(f.target, '.git'))
        await Fs.writeFile(
          Path.join(f.target, '.git'),
          `gitdir: ${f.moduleMetadata}\n`
        )
      }
      const beforeTarget = await fileSnapshot(f.target)
      const beforeMetadata = await fileSnapshot(f.moduleMetadata)
      intercept = async ([, cwd]) => {
        assert.notEqual(Path.resolve(cwd), Path.resolve(f.module))
        assert.notEqual(Path.resolve(cwd), Path.resolve(f.target))
      }
      await assert.rejects(f.check(), /Cannot establish private ownership/)
      intercept = undefined
      assert.deepEqual(await fileSnapshot(f.target), beforeTarget)
      assert.deepEqual(await fileSnapshot(f.moduleMetadata), beforeMetadata)
      assert.match(await f.branch(), /finished/)
      assert.equal(await exists(f.linked), true)
    }
  })

  it('classifies an absent nested submodule parent while rejecting existing linked ancestors', async t => {
    const f = await fixture(t)
    const moduleSource = await setup(t)
    await run(
      moduleSource.path,
      'commit',
      '--allow-empty',
      '-m',
      'nested module'
    )
    const moduleSha = await run(moduleSource.path, 'rev-parse', 'HEAD')
    await Fs.writeFile(
      Path.join(f.repo.path, '.gitmodules'),
      '[submodule "nested"]\n\tpath = nested/more/module\n\turl = ../module\n'
    )
    await run(f.repo.path, 'add', '--', '.gitmodules')
    await run(
      f.repo.path,
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${moduleSha},nested/more/module`
    )
    await run(f.repo.path, 'commit', '-m', 'record uninitialized nested module')
    await run(f.linked, 'merge', 'master')
    for (const relative of ['nested/more/module', 'nested/more', 'nested']) {
      const path = Path.join(f.linked, relative)
      if (await exists(path)) {
        await Fs.rmdir(path)
      }
    }
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    assert.equal(confirmed.submodules[0].state, 'uninitialized')
    assert.equal(
      confirmed.submodules[0].path,
      Path.join('nested', 'more', 'module')
    )
    const external = Path.join(f.root, 'external-parent')
    await Fs.mkdir(external)
    await Fs.writeFile(Path.join(external, 'sentinel'), 'external parent work')
    await Fs.symlink(external, Path.join(f.linked, 'nested'), 'junction')
    await assert.rejects(f.check(), /ordinary directory/)
    assert.equal(
      await Fs.readFile(Path.join(external, 'sentinel'), 'utf8'),
      'external parent work'
    )
    await Fs.unlink(Path.join(f.linked, 'nested'))
    await remove(f.repo.path, await f.check(), false, true)
    assert.equal(await exists(f.linked), false)
    assert.equal(await f.branch(), '')
  })

  it('retains a complete private module when the target commit is unavailable without fetching', async t => {
    const f = await fixture(t, true)
    const foreign = await setup(t)
    await Fs.writeFile(
      Path.join(foreign.path, 'foreign.txt'),
      'foreign target object'
    )
    await run(foreign.path, 'add', '.')
    await run(foreign.path, 'commit', '-m', 'independent target')
    const missing = await run(foreign.path, 'rev-parse', 'HEAD')
    await run(
      f.repo.path,
      'update-index',
      '--cacheinfo',
      `160000,${missing},module`
    )
    await run(
      f.repo.path,
      'commit',
      '-m',
      'target records unavailable module commit'
    )
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    const originalHead = await Fs.readFile(Path.join(metadata, 'HEAD'))
    const originalIndex = await Fs.readFile(Path.join(metadata, 'index'))
    const calls: ExecArgs[] = []
    intercept = async args => {
      calls.push(args)
    }
    const confirmed = await f.check()
    const module = confirmed.submodules[0]
    assert.equal(confirmed.hasFiles, false)
    assert.notEqual(module.state, 'blocked')
    assert.deepEqual(module.blockers, [])
    assert.equal(module.issues[0].kind, 'target-unavailable')
    assert.equal(module.issues[0].path, 'module')
    assert.equal(module.issues[0].revision, missing)
    assert.match(module.issues[0].message, /unavailable.*local/i)
    assert.equal(module.issues[0].message.includes(missing), true)
    assert.doesNotMatch(module.issues[0].message, /fatal:|not a valid commit/)
    const backup = await remove(f.repo.path, confirmed, false, true)
    assert(backup)
    const savedMetadata = await retainedModule(backup, metadata)
    assert.equal(
      calls.some(([args]) => args.includes('fetch')),
      false
    )
    const probes = calls.filter(
      ([args]) => args[0] === 'rev-parse' && args.includes('--quiet')
    )
    assert(probes.length > 0)
    for (const [, , options] of probes) {
      assert.equal(options?.env?.GIT_NO_LAZY_FETCH, '1')
      assert.equal(options?.env?.GIT_OPTIONAL_LOCKS, '0')
    }
    intercept = undefined
    assert.deepEqual(
      await Fs.readFile(Path.join(savedMetadata, 'HEAD')),
      originalHead
    )
    assert.deepEqual(
      await Fs.readFile(Path.join(savedMetadata, 'index')),
      originalIndex
    )
    assert.equal(
      (
        await dugite.exec(
          [
            `--git-dir=${savedMetadata}`,
            'cat-file',
            '-e',
            `${missing}^{commit}`,
          ],
          f.repo.path
        )
      ).exitCode,
      128
    )
    assert.equal(
      await run(
        f.repo.path,
        `--git-dir=${savedMetadata}`,
        `--work-tree=${f.repo.path}`,
        'show',
        'HEAD:module.txt'
      ),
      'module original'
    )
    assert.equal(await exists(f.linked), false)
    assert.equal(await f.branch(), '')
  })

  it('returns a typed unavailable-HEAD blocker and preserves unborn local metadata', async t => {
    const f = await fixture(t, true)
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    await run(f.module, 'symbolic-ref', 'HEAD', 'refs/heads/missing-local-head')
    const originalHead = await Fs.readFile(Path.join(metadata, 'HEAD'))
    const originalIndex = await Fs.readFile(Path.join(metadata, 'index'))
    const confirmed = await f.check()
    assert.equal(confirmed.submodules[0].state, 'blocked')
    assert.equal(confirmed.submodules[0].issues[0].kind, 'head-unavailable')
    assert.equal(confirmed.submodules[0].issues[0].revision, 'HEAD')
    assert.equal(confirmed.submodules[0].issues[0].path, 'module')
    await assert.rejects(
      remove(f.repo.path, confirmed, true, true),
      /files.*(?:handled|block)/i
    )
    assert.deepEqual(
      await Fs.readFile(Path.join(metadata, 'HEAD')),
      originalHead
    )
    assert.deepEqual(
      await Fs.readFile(Path.join(metadata, 'index')),
      originalIndex
    )
    assert.match(await f.branch(), /finished/)
  })

  it('accepts normal ancestry when the target descendant commit is locally available', async t => {
    const f = await fixture(t, true)
    const original = await run(f.module, 'rev-parse', 'HEAD')
    await run(f.module, 'commit', '--allow-empty', '-m', 'available descendant')
    const target = await run(f.module, 'rev-parse', 'HEAD')
    await run(f.module, 'checkout', '--detach', original)
    await run(
      f.repo.path,
      'update-index',
      '--cacheinfo',
      `160000,${target},module`
    )
    await run(f.repo.path, 'commit', '-m', 'record available descendant target')
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    assert.equal(confirmed.submodules[0].state, 'clean')
    assert.deepEqual(confirmed.submodules[0].issues, [])
    assert.equal(confirmed.submodules[0].head, original)
    assert.equal(confirmed.submodules[0].target, target)
    assert(await remove(f.repo.path, confirmed, false, true))
    assert.equal(await exists(f.linked), false)
  })

  it('distinguishes an unavailable intermediate history object from missing endpoints', async t => {
    const f = await fixture(t, true)
    const original = await run(f.module, 'rev-parse', 'HEAD')
    await run(f.module, 'commit', '--allow-empty', '-m', 'intermediate history')
    const intermediate = await run(f.module, 'rev-parse', 'HEAD')
    await run(f.module, 'commit', '--allow-empty', '-m', 'available endpoint')
    const target = await run(f.module, 'rev-parse', 'HEAD')
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    await run(f.module, 'checkout', '--detach', original)
    await run(
      f.repo.path,
      'update-index',
      '--cacheinfo',
      `160000,${target},module`
    )
    await run(
      f.repo.path,
      'commit',
      '-m',
      'record target with incomplete local history'
    )
    const object = Path.join(
      metadata,
      'objects',
      intermediate.slice(0, 2),
      intermediate.slice(2)
    )
    await Fs.chmod(object, 0o666)
    await Fs.unlink(object)
    await assert.rejects(f.check(), /object|history|fsck|missing/i)
    assert.equal(await exists(f.linked), true)
    assert.equal(await exists(metadata), true)
    assert.match(await f.branch(), /finished/)
  })

  it('unlinks a registered submodule junction without inspecting or changing the main submodule target', async t => {
    const f = await junctionSubmoduleFixture(t)
    const metadata = await run(f.target, 'rev-parse', '--absolute-git-dir')
    await Fs.mkdir(Path.join(f.target, 'node_modules'))
    await Fs.writeFile(
      Path.join(f.target, 'node_modules', 'dependency.js'),
      'shared dependency sentinel'
    )
    await Fs.writeFile(Path.join(f.target, 'local.txt'), 'main-only work')
    await Fs.writeFile(Path.join(f.target, 'module.txt'), 'main modified work')
    const beforeTarget = await fileSnapshot(f.target)
    const beforeMetadata = await fileSnapshot(metadata)
    intercept = async ([, cwd]) => {
      const relative = Path.relative(f.module, cwd)
      assert(
        relative.startsWith('..') || Path.isAbsolute(relative),
        `Git must not inspect the linked submodule: ${cwd}`
      )
      assert.notEqual(Path.resolve(cwd), Path.resolve(f.target))
    }
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    assert.equal(confirmed.submodules[0].state, 'linked')
    assert.equal(confirmed.submodules[0].head, null)
    assert.equal(confirmed.submodules[0].gitDir, null)
    assert.equal(confirmed.metadataPaths.includes(metadata), false)
    assert.equal(
      confirmed.files.some(e => e.path === 'module' && e.kind === 'link'),
      true
    )
    assert.equal(
      confirmed.files.some(e => e.path.startsWith(`module${Path.sep}`)),
      false
    )
    await assert.rejects(
      remove(f.repo.path, confirmed),
      /confirm removal of submodule/
    )
    await remove(f.repo.path, confirmed, false, true)
    assert.equal(await exists(f.linked), false)
    assert.equal(await f.branch(), '')
    assert.deepEqual(await fileSnapshot(f.target), beforeTarget)
    assert.deepEqual(await fileSnapshot(metadata), beforeMetadata)
  })

  it('rejects a registered submodule junction target replaced after confirmation', async t => {
    const f = await junctionSubmoduleFixture(t)
    const confirmed = await f.check()
    const replacement = Path.join(f.root, 'replacement-module')
    await Fs.mkdir(replacement)
    await Fs.writeFile(Path.join(replacement, 'sentinel'), 'replacement work')
    await Fs.unlink(f.module)
    await Fs.symlink(replacement, f.module, 'junction')
    await assert.rejects(
      remove(f.repo.path, confirmed, true, true),
      /changed|inventory/
    )
    assert.equal(
      await Fs.readFile(Path.join(replacement, 'sentinel'), 'utf8'),
      'replacement work'
    )
    assert.equal(
      await Fs.readFile(Path.join(f.target, 'module.txt'), 'utf8'),
      'module original\n'
    )
    assert.match(await f.branch(), /finished/)
  })

  it('continues rejecting cleanup junction roots and junction ancestors', async t => {
    const root = await createTempDirectory(t)
    const target = Path.join(root, 'target')
    const link = Path.join(root, 'link')
    await Fs.mkdir(Path.join(target, 'child'), { recursive: true })
    await Fs.writeFile(Path.join(target, 'child', 'sentinel'), 'keep target')
    await Fs.symlink(target, link, 'junction')
    const { inventoryCleanupFiles } = await import(
      '../../../src/lib/git/worktree-cleanup-files'
    )
    await assert.rejects(inventoryCleanupFiles(link), /ordinary directory/)
    await assert.rejects(
      inventoryCleanupFiles(Path.join(link, 'child')),
      /ordinary directory/
    )
    assert.equal(
      await Fs.readFile(Path.join(target, 'child', 'sentinel'), 'utf8'),
      'keep target'
    )
  })

  it('preserves sandbox-protected worktree files before direct cleanup starts', async t => {
    const f = await fixture(t)
    const confirmed = await f.check()
    const { saveSandboxRule } = await import(
      '../../../src/lib/git/sandbox-rule'
    )
    await saveSandboxRule(f.repo.path, 'refs/heads/finished', {
      version: 1,
      branch: 'refs/heads/finished',
      worktreePath: f.linked,
      remote: 'origin',
      remoteURL: 'https://example.invalid/repository.git',
      selector: 'branch',
      sourceBranch: 'master',
    })
    await assert.rejects(remove(f.repo.path, confirmed), /sandbox|protected/i)
    assert.equal(
      await Fs.readFile(Path.join(f.linked, 'tracked.txt'), 'utf8'),
      'parent original\n'
    )
    assert.match(await f.branch(), /finished/)
  })

  it('refuses protected assisted-commit resources before changing files', async t => {
    const f = await fixture(t)
    const confirmed = await f.check()
    const { protectAssistedCommitResources } = await import(
      '../../../src/lib/git/repository-operation'
    )
    const protection = protectAssistedCommitResources(f.linked, [f.linked])
    t.after(() => protection.release())
    await assert.rejects(
      remove(f.repo.path, confirmed),
      /assisted|protected|busy/i
    )
    assert.equal(
      await Fs.readFile(Path.join(f.linked, 'tracked.txt'), 'utf8'),
      'parent original\n'
    )
    assert.match(await f.branch(), /finished/)
  })

  it('unlinks Windows junctions and nested links without changing dependency targets or siblings', async t => {
    const f = await fixture(t)
    const target = Path.join(f.repo.path, 'node_modules')
    await Fs.mkdir(target)
    await Fs.writeFile(
      Path.join(target, 'dependency.js'),
      'main dependency sentinel'
    )
    const sibling = Path.join(f.root, 'sibling.txt')
    await Fs.writeFile(sibling, 'sibling sentinel')
    const junction = Path.join(f.linked, 'node_modules')
    await Fs.symlink(target, junction, 'junction')
    await Fs.mkdir(Path.join(f.linked, 'dist'))
    await Fs.symlink(target, Path.join(f.linked, 'dist', 'nested'), 'junction')
    const confirmed = await f.check()
    await assert.rejects(
      remove(f.repo.path, confirmed),
      /confirm removal of ignored/
    )
    assert.equal(
      await Fs.readFile(Path.join(target, 'dependency.js'), 'utf8'),
      'main dependency sentinel'
    )
    await remove(f.repo.path, confirmed, true)
    assert.equal(await exists(f.linked), false)
    assert.equal(await f.branch(), '')
    assert.equal(
      await Fs.readFile(Path.join(target, 'dependency.js'), 'utf8'),
      'main dependency sentinel'
    )
    assert.equal(await Fs.readFile(sibling, 'utf8'), 'sibling sentinel')
    assert.equal(
      await Fs.readFile(Path.join(f.repo.path, 'tracked.txt'), 'utf8'),
      'parent original\n'
    )
  })

  it('rejects a same-name junction target replacement after confirmation', async t => {
    const f = await fixture(t)
    const first = Path.join(f.root, 'first')
    const second = Path.join(f.root, 'second')
    await Fs.mkdir(first)
    await Fs.mkdir(second)
    await Fs.writeFile(Path.join(second, 'sentinel'), 'keep')
    const link = Path.join(f.linked, 'node_modules')
    await Fs.symlink(first, link, 'junction')
    const confirmed = await f.check()
    await Fs.unlink(link)
    await Fs.symlink(second, link, 'junction')
    await assert.rejects(
      remove(f.repo.path, confirmed, true),
      /inventory changed/
    )
    assert.equal(
      await Fs.readFile(Path.join(second, 'sentinel'), 'utf8'),
      'keep'
    )
    assert.match(await f.branch(), /finished/)
  })

  it('rejects changed content under an unchanged ignored path list', async t => {
    const f = await fixture(t)
    await Fs.mkdir(Path.join(f.linked, 'dist'))
    const output = Path.join(f.linked, 'dist', 'bundle.js')
    await Fs.writeFile(output, 'reviewed output')
    const confirmed = await f.check()
    await Fs.writeFile(output, 'new output must be reviewed')
    await assert.rejects(
      remove(f.repo.path, confirmed, true),
      /inventory changed/
    )
    assert.equal(
      await Fs.readFile(output, 'utf8'),
      'new output must be reviewed'
    )
    assert.match(await f.branch(), /finished/)
  })

  for (const incomplete of [false, true]) {
    it(`retains and restores ${
      incomplete ? 'missing-index empty' : 'clean'
    } submodule metadata, refs, stashes and objects`, async t => {
      const f = await fixture(t, true)
      await run(f.module, 'branch', 'local-keep')
      await Fs.writeFile(
        Path.join(f.module, 'stashed.txt'),
        'submodule stash sentinel'
      )
      await run(f.module, 'stash', 'push', '-u', '-m', 'submodule saved work')
      const moduleHead = await run(f.module, 'rev-parse', 'HEAD')
      const stashHead = await run(f.module, 'rev-parse', 'refs/stash')
      const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
      if (incomplete) {
        await Fs.unlink(Path.join(f.module, 'module.txt'))
        await Fs.unlink(Path.join(metadata, 'index'))
      }
      const confirmed = await f.check()
      assert.equal(confirmed.hasFiles, false)
      assert.equal(
        confirmed.submodules[0].state,
        incomplete ? 'incomplete' : 'clean'
      )
      await assert.rejects(
        remove(f.repo.path, confirmed),
        /confirm removal of submodule/
      )
      const backup = await remove(f.repo.path, confirmed, false, true)
      assert(backup)
      assert.equal(await exists(f.linked), false)
      assert.equal(await f.branch(), '')
      const manifest = JSON.parse(
        await Fs.readFile(Path.join(backup, 'restore.json'), 'utf8')
      )
      assert.equal(manifest.worktree, f.linked)
      assert.equal(manifest.metadata.length, 1)
      assert.equal(manifest.submodules.length, 1)
      assert.equal(manifest.submodules[0].path, 'module')
      assert.match(manifest.submodules[0].gitPointer, /^gitdir: /)
      await run(
        f.repo.path,
        'worktree',
        'add',
        '-b',
        'restored',
        f.linked,
        confirmed.branchSha
      )
      for (const entry of manifest.metadata) {
        await Fs.mkdir(Path.dirname(entry.original), { recursive: true })
        await Fs.rename(Path.join(backup, entry.saved), entry.original)
      }
      await Fs.mkdir(f.module, { recursive: true })
      await Fs.writeFile(Path.join(f.module, '.git'), `gitdir: ${metadata}\n`)
      assert.equal(await run(f.module, 'rev-parse', 'HEAD'), moduleHead)
      assert.equal(
        await run(f.module, 'rev-parse', 'refs/heads/local-keep'),
        moduleHead
      )
      assert.equal(await run(f.module, 'rev-parse', 'refs/stash'), stashHead)
      assert.equal(
        await run(f.module, 'show', 'refs/stash:stashed.txt').catch(() =>
          run(f.module, 'show', 'refs/stash^3:stashed.txt')
        ),
        'submodule stash sentinel'
      )
      await run(f.module, 'reset', '--hard', 'HEAD')
      assert.equal(
        await Fs.readFile(Path.join(f.module, 'module.txt'), 'utf8'),
        'module original\n'
      )
      assert.equal(
        await run(Path.join(f.repo.path, 'module'), 'status', '--porcelain'),
        ''
      )
    })
  }

  for (const change of [
    'modified',
    'staged',
    'untracked',
    'staged-deletions',
  ]) {
    it(`blocks genuine ${change} in a submodule and preserves its content and branch`, async t => {
      const f = await fixture(t, true)
      if (change === 'untracked') {
        await Fs.writeFile(Path.join(f.module, 'local.txt'), 'keep local')
      } else if (change === 'staged-deletions') {
        await run(f.module, 'rm', 'module.txt')
      } else {
        await Fs.writeFile(Path.join(f.module, 'module.txt'), 'keep modified')
        if (change !== 'modified') {
          await run(f.module, 'add', '.')
        }
      }
      const confirmed = await f.check()
      assert.equal(confirmed.hasFiles, true)
      assert.equal(confirmed.submodules[0].state, 'blocked')
      await assert.rejects(
        remove(f.repo.path, confirmed, true, true),
        /files.*(?:handled|block)/i
      )
      assert.match(await f.branch(), /finished/)
      assert.equal(await exists(Path.join(f.module, '.git')), true)
    })
  }

  it('blocks submodule metadata pointing to the main checkout', async t => {
    const f = await fixture(t, true)
    const mainMetadata = await run(
      Path.join(f.repo.path, 'module'),
      'rev-parse',
      '--absolute-git-dir'
    )
    await Fs.unlink(Path.join(f.module, '.git'))
    await Fs.writeFile(Path.join(f.module, '.git'), `gitdir: ${mainMetadata}\n`)
    await assert.rejects(f.check(), /exclusive submodule metadata ownership/)
    assert.equal(
      await run(Path.join(f.repo.path, 'module'), 'status', '--porcelain'),
      ''
    )
  })

  it('rejects transitive alternate objects which depend on selected ignored output', async t => {
    const f = await fixture(t, true)
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    const external = Path.join(f.root, 'external-objects')
    const disposable = Path.join(f.linked, 'dist', 'objects')
    await Fs.mkdir(Path.join(external, 'info'), { recursive: true })
    await Fs.mkdir(Path.join(disposable, 'info'), { recursive: true })
    await Fs.writeFile(
      Path.join(external, 'info', 'alternates'),
      `${disposable.replace(/\\/g, '/')}\n`
    )
    await Fs.mkdir(Path.join(metadata, 'objects', 'info'), { recursive: true })
    await Fs.writeFile(
      Path.join(metadata, 'objects', 'info', 'alternates'),
      `${external.replace(/\\/g, '/')}\n`
    )
    await assert.rejects(f.check(), /alternate|object/i)
    assert.equal(await exists(f.linked), true)
    assert.match(await f.branch(), /finished/)
  })

  it('retains embedded submodule git directories independently of checkout removal', async t => {
    const f = await fixture(t, true)
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    await Fs.unlink(Path.join(f.module, '.git'))
    await Fs.rename(metadata, Path.join(f.module, '.git'))
    await run(
      f.repo.path,
      'config',
      '--file',
      Path.join(f.module, '.git', 'config'),
      'core.worktree',
      '..'
    )
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    const backup = await remove(f.repo.path, confirmed, false, true)
    assert(backup)
    assert.equal(await exists(f.linked), false)
    const manifest = JSON.parse(
      await Fs.readFile(Path.join(backup, 'restore.json'), 'utf8')
    )
    assert(
      manifest.metadata.some(
        (entry: { original: string }) =>
          entry.original === Path.join(f.module, '.git')
      )
    )
    const entry = manifest.metadata.find(
      (entry: { original: string }) =>
        entry.original === Path.join(f.module, '.git')
    )
    assert.equal(
      await run(
        f.repo.path,
        `--git-dir=${Path.join(backup, entry.saved)}`,
        `--work-tree=${f.repo.path}`,
        'show',
        'HEAD:module.txt'
      ),
      'module original'
    )
  })

  it('keeps branch on a real compare-and-delete race after worktree removal', async t => {
    const f = await fixture(t)
    const confirmed = await f.check()
    const newTip = await run(
      f.repo.path,
      'commit-tree',
      `${confirmed.branchSha}^{tree}`,
      '-p',
      confirmed.branchSha,
      '-m',
      'racing commit'
    )
    intercept = async ([args, cwd]) => {
      if (args[0] === 'update-ref' && args[1] === '-d') {
        intercept = undefined
        await run(cwd, 'update-ref', 'refs/heads/finished', newTip)
      }
    }
    await assert.rejects(
      remove(f.repo.path, confirmed),
      /branch could not be deleted/
    )
    assert.equal(await exists(f.linked), false)
    assert.equal(
      await run(f.repo.path, 'rev-parse', 'refs/heads/finished'),
      newTip
    )
  })

  it('reports partial changes and retains branch plus backup when unregistering fails', async t => {
    const f = await fixture(t, true)
    const confirmed = await f.check()
    intercept = async ([args]) => {
      if (args[0] === 'worktree' && args[1] === 'remove') {
        throw new Error('injected unregister failure')
      }
    }
    await assert.rejects(
      remove(f.repo.path, confirmed, false, true),
      /partial changes.*branch was kept.*retention directory.*injected unregister failure/
    )
    intercept = undefined
    assert.match(await f.branch(), /finished/)
    const backups = await Fs.readdir(confirmed.metadataBackupRoot)
    assert.equal(backups.length, 1)
    assert.equal(
      await exists(
        Path.join(confirmed.metadataBackupRoot, backups[0], 'restore.json')
      ),
      true
    )
    assert.equal(
      await run(Path.join(f.repo.path, 'module'), 'status', '--porcelain'),
      ''
    )
  })
})

describe('explicit disposable-file policy for worktree cleanup', () => {
  it('blocks an externally routed GIT_GRAFT_FILE before inspection or mutation', async t => {
    const f = await fixture(t, true)
    const confirmed = await f.check()
    const graft = Path.join(f.root, 'external-grafts')
    await Fs.writeFile(graft, '# external history routing must not be used\n')
    const before = await fileSnapshot(f.linked)
    const previous = process.env.GIT_GRAFT_FILE
    try {
      process.env.GIT_GRAFT_FILE = graft
      intercept = async () =>
        assert.fail('Git must not inspect externally routed history')
      await assert.rejects(f.check(), /environment routing/)
      await assert.rejects(
        remove(f.repo.path, confirmed, true, true),
        /environment routing/
      )
    } finally {
      intercept = undefined
      if (previous === undefined) {
        delete process.env.GIT_GRAFT_FILE
      } else {
        process.env.GIT_GRAFT_FILE = previous
      }
    }
    assert.deepEqual(await fileSnapshot(f.linked), before)
    assert.equal(
      await Fs.readFile(graft, 'utf8'),
      '# external history routing must not be used\n'
    )
    assert.match(await f.branch(), /finished/)
  })

  it('refuses metadata refs changed after confirmation before deleting any checkout files', async t => {
    const f = await fixture(t, true)
    const confirmed = await f.check()
    await run(
      f.module,
      'update-ref',
      'refs/private/late-work',
      confirmed.submodules[0].head ?? 'HEAD'
    )
    await assert.rejects(
      remove(f.repo.path, confirmed, false, true),
      /changed|refresh|review/i
    )
    assert.equal(await exists(f.linked), true)
    assert.equal(
      await Fs.readFile(Path.join(f.module, 'module.txt'), 'utf8'),
      'module original\n'
    )
    assert.equal(
      await run(f.module, 'rev-parse', 'refs/private/late-work'),
      confirmed.submodules[0].head
    )
    assert.match(await f.branch(), /finished/)
  })

  it('refuses a staged gitlink change even when wildcard policy matches the module', async t => {
    const f = await fixture(t, true)
    await commitRemovalPolicy(f, '*\n')
    await run(f.module, 'commit', '--allow-empty', '-m', 'local module commit')
    await run(f.linked, 'add', '--', 'module')
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, true)
    assert(confirmed.changedPaths.includes('module'))
    await assert.rejects(
      remove(f.repo.path, confirmed, true, true),
      /files.*(?:handled|block)/i
    )
    assert.match(await f.branch(), /finished/)
    assert.equal(await exists(f.module), true)
  })

  it('blocks a corrupt unreachable local object before archiving or deleting the checkout', async t => {
    const f = await fixture(t, true)
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    const directory = Path.join(metadata, 'objects', 'aa')
    await Fs.mkdir(directory, { recursive: true })
    await Fs.writeFile(
      Path.join(directory, 'b'.repeat(38)),
      'corrupt loose object'
    )
    const before = await fileSnapshot(metadata)
    await assert.rejects(
      f.check(),
      /object|inflate|corrupt|fsck|history|git returned/i
    )
    assert.deepEqual(await fileSnapshot(metadata), before)
    assert.equal(
      await Fs.readFile(Path.join(f.module, 'module.txt'), 'utf8'),
      'module original\n'
    )
    assert.match(await f.branch(), /finished/)
  })

  it('recovers differing local commits, private refs, stashes, reflog-only commits and loose objects from the archive', async t => {
    const f = await fixture(t, true)
    await Fs.writeFile(
      Path.join(f.module, 'module.txt'),
      'private committed content\n'
    )
    await run(f.module, 'add', '--', 'module.txt')
    await run(f.module, 'commit', '-m', 'private local commit')
    const localHead = await run(f.module, 'rev-parse', 'HEAD')
    await run(f.module, 'branch', 'private-keep')
    await run(f.module, 'update-ref', 'refs/private/sentinel', localHead)
    await run(
      f.module,
      'commit',
      '--allow-empty',
      '-m',
      'reflog-only saved commit'
    )
    const reflogOnly = await run(f.module, 'rev-parse', 'HEAD')
    await run(f.module, 'reset', '--hard', localHead)
    await Fs.writeFile(
      Path.join(f.module, 'stashed.txt'),
      'private stash content'
    )
    await run(f.module, 'stash', 'push', '-u', '-m', 'private saved work')
    const stash = await run(f.module, 'rev-parse', 'refs/stash')
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    const reflog = await Fs.readFile(Path.join(metadata, 'logs', 'HEAD'))
    const looseFile = Path.join(f.root, 'unreachable-object.txt')
    await Fs.writeFile(looseFile, 'unreachable object sentinel')
    const loose = await run(f.module, 'hash-object', '-w', '--', looseFile)
    const mainModule = Path.join(f.repo.path, 'module')
    const mainMetadata = await run(
      mainModule,
      'rev-parse',
      '--absolute-git-dir'
    )
    const mainFiles = await fileSnapshot(mainModule)
    const mainGit = await fileSnapshot(mainMetadata)
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    assert.deepEqual(confirmed.submodules[0].blockers, [])
    assert(
      confirmed.submodules[0].issues.some(
        issue => issue.kind === 'ancestry-unproven'
      )
    )
    await assert.rejects(
      remove(f.repo.path, confirmed),
      /confirm removal of submodule/
    )
    const backup = await remove(f.repo.path, confirmed, false, true)
    assert(backup)
    const saved = await retainedModule(backup, metadata)
    const archived = (...args: string[]) =>
      run(
        f.repo.path,
        `--git-dir=${saved}`,
        `--work-tree=${f.repo.path}`,
        ...args
      )
    assert.equal(await exists(metadata), false)
    assert.equal(await exists(f.linked), false)
    assert.equal(await f.branch(), '')
    assert.equal(await archived('rev-parse', 'HEAD'), localHead)
    assert.equal(
      await archived('rev-parse', 'refs/heads/private-keep'),
      localHead
    )
    assert.equal(
      await archived('rev-parse', 'refs/private/sentinel'),
      localHead
    )
    assert.equal(await archived('rev-parse', 'refs/stash'), stash)
    assert.equal(
      await archived('show', 'HEAD:module.txt'),
      'private committed content'
    )
    assert.equal(
      await archived('show', 'refs/stash^3:stashed.txt'),
      'private stash content'
    )
    assert.equal(await archived('cat-file', '-t', reflogOnly), 'commit')
    assert.equal(
      await archived('cat-file', '-p', loose),
      'unreachable object sentinel'
    )
    assert.deepEqual(
      await Fs.readFile(Path.join(saved, 'logs', 'HEAD')),
      reflog
    )
    assert.equal(
      await exists(Path.join(saved, 'objects', 'info', 'alternates')),
      false
    )
    await archived('fsck', '--full', '--strict')
    assert.deepEqual(await fileSnapshot(mainModule), mainFiles)
    assert.deepEqual(await fileSnapshot(mainMetadata), mainGit)
  })

  it('removes matching untracked and ignored paths without extra ignored-file consent', async t => {
    const f = await fixture(t, true)
    await commitRemovalPolicy(
      f,
      '# disposable outputs\n/root-output/\n/dist/\nmodule/generated/**\nmodule/*.cache\n'
    )
    await Fs.mkdir(Path.join(f.linked, 'root-output'))
    await Fs.writeFile(
      Path.join(f.linked, 'root-output', 'local.txt'),
      'discard'
    )
    await Fs.mkdir(Path.join(f.linked, 'dist'))
    await Fs.writeFile(Path.join(f.linked, 'dist', 'bundle.js'), 'discard')
    await Fs.mkdir(Path.join(f.module, 'generated'))
    const moduleMetadata = await run(
      f.module,
      'rev-parse',
      '--absolute-git-dir'
    )
    await Fs.appendFile(
      Path.join(moduleMetadata, 'info', 'exclude'),
      '\ngenerated/\n'
    )
    await Fs.writeFile(Path.join(f.module, 'generated', 'asset.js'), 'discard')
    await Fs.writeFile(Path.join(f.module, 'result.cache'), 'discard')
    const mainModule = Path.join(f.repo.path, 'module')
    const mainMetadata = await run(
      mainModule,
      'rev-parse',
      '--absolute-git-dir'
    )
    const main = await fileSnapshot(mainModule)
    const mainGit = await fileSnapshot(mainMetadata)
    const mainFile = await Fs.readFile(Path.join(f.repo.path, 'tracked.txt'))
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    const backup = await remove(f.repo.path, confirmed, false, true)
    assert(backup)
    assert.equal(await exists(f.linked), false)
    assert.equal(await f.branch(), '')
    // Parent checkout, its module and dependency metadata are never cleanup targets.
    assert.deepEqual(await fileSnapshot(mainModule), main)
    assert.deepEqual(await fileSnapshot(mainMetadata), mainGit)
    assert.deepEqual(
      await Fs.readFile(Path.join(f.repo.path, 'tracked.txt')),
      mainFile
    )
  })

  it('uses gitignore anchoring, globstars, character classes and escaped markers', async t => {
    const f = await fixture(t)
    await commitRemovalPolicy(
      f,
      '/root.tmp\n**/*.cache\n[a-b].tmp\n\\#generated\n\\!generated\n'
    )
    await Fs.mkdir(Path.join(f.linked, 'nested'))
    for (const path of [
      'root.tmp',
      'nested/item.cache',
      'a.tmp',
      '#generated',
      '!generated',
    ]) {
      await Fs.writeFile(Path.join(f.linked, path), 'discard')
    }
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    await remove(f.repo.path, confirmed)
    assert.equal(await exists(f.linked), false)
  })

  for (const ignored of [false, true]) {
    it(`keeps a negated ${
      ignored ? 'ignored' : 'untracked'
    } exception blocked`, async t => {
      const f = await fixture(t)
      const directory = ignored ? 'dist' : 'scratch'
      await commitRemovalPolicy(f, `${directory}/*\n!${directory}/keep.txt\n`)
      await Fs.mkdir(Path.join(f.linked, directory))
      await Fs.writeFile(
        Path.join(f.linked, directory, 'remove.txt'),
        'discard'
      )
      await Fs.writeFile(Path.join(f.linked, directory, 'keep.txt'), 'preserve')
      const confirmed = await f.check()
      if (ignored) {
        assert(confirmed.ignoredPaths.length > 0)
        await assert.rejects(remove(f.repo.path, confirmed), /ignored files/)
      } else {
        assert.equal(confirmed.hasFiles, true)
        await assert.rejects(
          remove(f.repo.path, confirmed, true),
          /files.*(?:handled|block)/i
        )
      }
      assert.equal(
        await Fs.readFile(Path.join(f.linked, directory, 'keep.txt'), 'utf8'),
        'preserve'
      )
      assert.match(await f.branch(), /finished/)
    })
  }

  it('does not let a root-anchored pattern authorize a nested same-name file', async t => {
    const f = await fixture(t)
    await commitRemovalPolicy(f, '/local.txt\n')
    await Fs.mkdir(Path.join(f.linked, 'nested'))
    await Fs.writeFile(Path.join(f.linked, 'nested', 'local.txt'), 'preserve')
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, true)
    await assert.rejects(
      remove(f.repo.path, confirmed, true),
      /files.*(?:handled|block)/i
    )
    assert.equal(await exists(Path.join(f.linked, 'nested', 'local.txt')), true)
  })

  it('requires an untracked policy to explicitly match its own filename', async t => {
    const f = await fixture(t)
    await Fs.writeFile(Path.join(f.linked, '.safe_to_remove'), 'local.txt\n')
    await Fs.writeFile(Path.join(f.linked, 'local.txt'), 'discard')
    const blocked = await f.check()
    assert.equal(blocked.hasFiles, true)
    await assert.rejects(
      remove(f.repo.path, blocked, true),
      /files.*(?:handled|block)/i
    )
    await Fs.appendFile(
      Path.join(f.linked, '.safe_to_remove'),
      '/.safe_to_remove\n'
    )
    const permitted = await f.check()
    assert.equal(permitted.hasFiles, false)
    await remove(f.repo.path, permitted)
    assert.equal(await exists(f.linked), false)
  })

  for (const inModule of [false, true]) {
    for (const change of [
      'modified',
      'staged',
      'staged-new',
      'staged-deletion',
    ]) {
      it(`refuses wildcard policy override of ${change} ${
        inModule ? 'submodule' : 'root'
      } tracked state`, async t => {
        const f = await fixture(t, inModule)
        await commitRemovalPolicy(f, '*\n')
        const root = inModule ? f.module : f.linked
        const name = inModule ? 'module.txt' : 'tracked.txt'
        if (change === 'staged-deletion') {
          await run(root, 'rm', '--', name)
        } else if (change === 'staged-new') {
          await Fs.writeFile(Path.join(root, 'new.txt'), 'preserve staged work')
          await run(root, 'add', '--', 'new.txt')
        } else {
          await Fs.writeFile(Path.join(root, name), 'preserve modified work')
          if (change === 'staged') {
            await run(root, 'add', '--', name)
          }
        }
        const confirmed = await f.check()
        assert.equal(confirmed.hasFiles, true)
        await assert.rejects(
          remove(f.repo.path, confirmed, true, true),
          /files.*(?:handled|block)/i
        )
        assert.equal(await exists(f.linked), true)
        assert.match(await f.branch(), /finished/)
      })
    }
  }

  it('rejects policy edits made after review even when matching output paths stay the same', async t => {
    const f = await fixture(t)
    await Fs.writeFile(Path.join(f.linked, '.safe_to_remove'), '*\n')
    await Fs.writeFile(Path.join(f.linked, 'output.txt'), 'discard')
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    await Fs.writeFile(
      Path.join(f.linked, '.safe_to_remove'),
      '*\n# changed consent\n'
    )
    await assert.rejects(
      remove(f.repo.path, confirmed, true),
      /changed|inventory/
    )
    assert.equal(
      await Fs.readFile(Path.join(f.linked, 'output.txt'), 'utf8'),
      'discard'
    )
    assert.match(await f.branch(), /finished/)
  })

  it('rejects a policy junction without traversing or changing its external target', async t => {
    const f = await fixture(t)
    const external = Path.join(f.root, 'external-policy')
    await Fs.mkdir(external)
    await Fs.writeFile(
      Path.join(external, 'sentinel'),
      'preserve external policy directory'
    )
    await Fs.symlink(
      external,
      Path.join(f.linked, '.safe_to_remove'),
      'junction'
    )
    const before = await fileSnapshot(external)
    await assert.rejects(
      f.check(),
      /safe_to_remove|policy|ordinary|regular file/i
    )
    assert.deepEqual(await fileSnapshot(external), before)
    assert.match(await f.branch(), /finished/)
  })

  it('unlinks explicitly disposable junctions while preserving their targets and a sibling worktree', async t => {
    const f = await fixture(t)
    await commitRemovalPolicy(f, '/disposable-link\n')
    const target = Path.join(f.root, 'shared-dependency')
    await Fs.mkdir(target)
    await Fs.writeFile(Path.join(target, 'sentinel'), 'keep dependency')
    await Fs.symlink(target, Path.join(f.linked, 'disposable-link'), 'junction')
    const sibling = Path.join(f.root, 'sibling')
    await run(f.repo.path, 'worktree', 'add', '-b', 'sibling', sibling)
    await Fs.writeFile(Path.join(sibling, 'sentinel'), 'keep sibling work')
    const beforeTarget = await fileSnapshot(target)
    const beforeSibling = await fileSnapshot(sibling)
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, false)
    await remove(f.repo.path, confirmed)
    assert.equal(await exists(f.linked), false)
    assert.deepEqual(await fileSnapshot(target), beforeTarget)
    assert.deepEqual(await fileSnapshot(sibling), beforeSibling)
  })

  it('does not authorize a junction itself from a rule matching only a target descendant', async t => {
    const f = await fixture(t)
    await commitRemovalPolicy(f, '/disposable-link/sentinel\n')
    const target = Path.join(f.root, 'shared-dependency')
    await Fs.mkdir(target)
    await Fs.writeFile(Path.join(target, 'sentinel'), 'keep dependency')
    await Fs.symlink(target, Path.join(f.linked, 'disposable-link'), 'junction')
    const before = await fileSnapshot(target)
    const confirmed = await f.check()
    assert.equal(confirmed.hasFiles, true)
    await assert.rejects(
      remove(f.repo.path, confirmed, true),
      /files.*(?:handled|block)/i
    )
    assert.deepEqual(await fileSnapshot(target), before)
    assert.equal(
      (await Fs.lstat(Path.join(f.linked, 'disposable-link'))).isSymbolicLink(),
      true
    )
    assert.match(await f.branch(), /finished/)
  })

  it('blocks external alternates rather than claiming a private self-contained archive', async t => {
    const f = await fixture(t, true)
    const metadata = await run(f.module, 'rev-parse', '--absolute-git-dir')
    const external = Path.join(f.root, 'external-objects')
    await Fs.mkdir(Path.join(external, 'info'), { recursive: true })
    await Fs.mkdir(Path.join(metadata, 'objects', 'info'), { recursive: true })
    await Fs.writeFile(
      Path.join(metadata, 'objects', 'info', 'alternates'),
      `${external.replace(/\\/g, '/')}\n`
    )
    const before = await fileSnapshot(metadata)
    await assert.rejects(f.check(), /alternate|object|self-contained|private/i)
    assert.deepEqual(await fileSnapshot(metadata), before)
    assert.equal(await exists(f.linked), true)
    assert.match(await f.branch(), /finished/)
  })
})
