import { createTempDirectory } from '../helpers/temp'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdir, writeFile, readFile, symlink } from 'fs/promises'
import * as Path from 'path'
import { setupEmptyRepository } from '../helpers/repositories'
import { git } from '../../src/lib/git/core'
import {
  parseArtifactConfig,
  previewArtifacts,
  cleanArtifacts,
  suggestArtifactConfig,
} from '../../src/lib/artifact-cleanup'

const config = JSON.stringify({
  version: 1,
  artifacts: [{ path: 'dist', kind: 'output' }],
})
async function fixture(t: Parameters<typeof setupEmptyRepository>[0]) {
  const repo = await setupEmptyRepository(t)
  await writeFile(Path.join(repo.path, '.gitignore'), 'dist/\nnode_modules/\n')
  await git(['add', '.gitignore'], repo.path, 'test')
  await git(['commit', '-m', 'base'], repo.path, 'test')
  await mkdir(Path.join(repo.path, 'dist'))
  await writeFile(Path.join(repo.path, 'dist', 'result'), 'generated')
  const preview = (hours = 0) =>
    previewArtifacts(repo.path, hours, new Map([[repo.path, config]]), [
      'output',
    ])
  return { repo, preview }
}
describe('artifact cleanup', () => {
  it('rejects traversal, protected paths, invalid hours and overlapping units', () => {
    for (const path of [
      '../x',
      '/tmp',
      'C:\\temp',
      '.git',
      'src',
      'out/../src',
    ]) {
      assert.throws(() =>
        parseArtifactConfig(
          JSON.stringify({ version: 1, artifacts: [{ path, kind: 'output' }] })
        )
      )
    }
    assert.throws(() =>
      parseArtifactConfig('{"version":1,"keepHours":-1,"artifacts":[]}')
    )
    assert.throws(() =>
      parseArtifactConfig(
        '{"version":1,"artifacts":[{"path":"dist","kind":"output"},{"path":"dist/sub","kind":"output"}]}'
      )
    )
  })
  it('removes only reviewed ignored output and preserves source and Git', async t => {
    const { repo, preview } = await fixture(t)
    const plan = await preview()
    assert.equal(plan.candidates[0].reason, null)
    assert.match((await cleanArtifacts(plan))[0], /^Removed/)
    assert.match(
      await readFile(Path.join(repo.path, '.gitignore'), 'utf8'),
      /dist/
    )
    assert.equal(
      (await git(['status', '--porcelain'], repo.path, 'test')).stdout,
      ''
    )
  })
  it('preserves the whole recently changed unit under 24-hour retention', async t => {
    const { preview } = await fixture(t)
    assert.match((await preview(24)).candidates[0].reason ?? '', /retention/)
  })
  it('rejects changes after preview', async t => {
    const { repo, preview } = await fixture(t)
    const plan = await preview()
    await writeFile(Path.join(repo.path, 'dist', 'new'), 'preserve')
    assert.match((await cleanArtifacts(plan))[0], /changed/)
    assert.equal(
      await readFile(Path.join(repo.path, 'dist', 'new'), 'utf8'),
      'preserve'
    )
  })
  it('blocks tracked and staged files inside artifacts', async t => {
    const { repo, preview } = await fixture(t)
    await git(['add', '-f', 'dist/result'], repo.path, 'test')
    assert.match((await preview()).candidates[0].reason ?? '', /tracked/)
  })
  it('blocks nested repositories and unignored folders', async t => {
    const { repo, preview } = await fixture(t)
    await mkdir(Path.join(repo.path, 'dist', '.git'))
    assert.match((await preview()).candidates[0].reason ?? '', /nested/)
    const plan = await previewArtifacts(
      repo.path,
      0,
      new Map([
        [
          repo.path,
          JSON.stringify({
            version: 1,
            artifacts: [{ path: 'other', kind: 'output' }],
          }),
        ],
      ]),
      ['output']
    )
    assert.notEqual(plan.candidates[0].reason, null)
  })
  it('honors cancellation and excludes dependencies unless requested', async t => {
    const { repo, preview } = await fixture(t)
    assert.match(
      (await cleanArtifacts(await preview(), () => true))[0],
      /Cancelled/
    )
    const plan = await previewArtifacts(
      repo.path,
      0,
      new Map([
        [
          repo.path,
          JSON.stringify({
            version: 1,
            artifacts: [{ path: 'node_modules', kind: 'dependencies' }],
          }),
        ],
      ]),
      ['output']
    )
    assert.equal(plan.candidates.length, 0)
  })
  it('reads project config and suggests Node dependencies', async t => {
    const { repo } = await fixture(t)
    await writeFile(Path.join(repo.path, 'package.json'), '{}')
    assert(
      parseArtifactConfig(
        await suggestArtifactConfig(repo.path)
      ).artifacts.some(a => a.path === 'node_modules')
    )
    await writeFile(Path.join(repo.path, '.gitdesktop-cleanup.json'), config)
    assert.equal(await suggestArtifactConfig(repo.path), config)
  })
  it('rechecks changed project configuration before deletion', async t => {
    const { repo, preview } = await fixture(t)
    const plan = await preview()
    await writeFile(Path.join(repo.path, '.gitdesktop-cleanup.json'), config)
    assert.match((await cleanArtifacts(plan))[0], /configuration changed/)
  })
  it('cleans main and linked worktrees with independently reviewed rules', async t => {
    const { repo } = await fixture(t)
    const linked = Path.join(await createTempDirectory(t), 'linked')
    await git(
      ['worktree', 'add', '-b', 'artifact-test', linked],
      repo.path,
      'test'
    )

    await mkdir(Path.join(linked, 'dist'))
    await writeFile(Path.join(linked, 'dist', 'result'), 'linked output')
    const plan = await previewArtifacts(
      repo.path,
      0,
      new Map([
        [repo.path, config],
        [linked, config],
      ]),
      ['output']
    )
    assert.equal(plan.candidates.filter(c => c.reason === null).length, 2)
    assert.equal(
      (await cleanArtifacts(plan)).filter(s => s.startsWith('Removed')).length,
      2
    )
    assert.equal(
      (await git(['branch', '--list', 'artifact-test'], repo.path, 'test'))
        .exitCode,
      0
    )
  })
  it('blocks directory junctions without deleting their target', async t => {
    const { repo } = await fixture(t)
    await symlink(
      Path.join(repo.path, 'dist'),
      Path.join(repo.path, 'node_modules'),
      'junction'
    )
    const rules = JSON.stringify({
      version: 1,
      artifacts: [{ path: 'node_modules', kind: 'dependencies' }],
    })
    const plan = await previewArtifacts(
      repo.path,
      0,
      new Map([[repo.path, rules]]),
      ['dependencies']
    )
    assert.match(plan.candidates[0].reason ?? '', /junction/)
    assert.equal(
      await readFile(Path.join(repo.path, 'dist', 'result'), 'utf8'),
      'generated'
    )
  })
})
