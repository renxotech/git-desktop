import assert from 'node:assert/strict'
import { describe, it, TestContext } from 'node:test'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { copyStaticResources } from './static-resources'

async function createFixture(t: TestContext) {
  const base = resolve(__dirname, '../tmp/package-metadata-qa')
  await mkdir(base, { recursive: true })
  const root = await mkdtemp(join(base, 'static-copy-'))
  t.after(async () => {
    // Only retire this test's resolved, disposable fixture directory.
    assert.equal(dirname(root), base)
    assert.ok(root.startsWith(join(base, 'static-copy-')))
    await rm(root, { recursive: true, force: true })
  })
  const platform = join(root, 'platform')
  const common = join(root, 'common')
  const destination = join(root, 'output')
  await mkdir(platform)
  await mkdir(common)
  return { root, platform, common, destination }
}

async function put(root: string, path: string, content: string) {
  const destination = join(root, path)
  await mkdir(resolve(destination, '..'), { recursive: true })
  await writeFile(destination, content)
}

async function snapshot(root: string): Promise<readonly string[]> {
  const entries = await readdir(root)
  const result: string[] = []
  for (const entry of entries.sort()) {
    const path = join(root, entry)
    const stats = await lstat(path)
    if (stats.isSymbolicLink()) {
      result.push(`link:${entry}:${await readlink(path)}`)
    } else if (stats.isDirectory()) {
      result.push(
        `directory:${entry}`,
        ...(await snapshot(path)).map(x => `${entry}/${x}`)
      )
    } else {
      result.push(`file:${entry}:${(await readFile(path)).toString('base64')}`)
    }
  }
  return result
}

describe('static resource copying', () => {
  for (const gitDirectory of [false, true]) {
    it(`omits root and nested .git ${
      gitDirectory ? 'directories' : 'files'
    } while retaining assets`, async t => {
      const { platform, common, destination } = await createFixture(t)
      for (const source of [platform, common]) {
        for (const metadata of ['.git', 'nested/.git']) {
          await put(
            source,
            gitDirectory ? `${metadata}/config` : metadata,
            'private Git metadata'
          )
        }
        await put(source, '.gitignore', '*.tmp\n')
        await put(source, '.gitattributes', '* text=auto\n')
        await put(source, 'nested/.gitkeep', '')
        await put(source, 'nested/asset.bin', '\u0000asset\u00ff')
      }
      await put(platform, 'collision.txt', 'platform wins')
      await put(common, 'collision.txt', 'common loses')
      await put(common, 'LICENSE.md', 'license text')
      await put(destination, 'stale/.git/config', 'old metadata')
      await put(destination, 'stale.txt', 'old output')
      const before = await Promise.all([snapshot(platform), snapshot(common)])

      copyStaticResources(platform, common, destination)

      assert.deepEqual(await snapshot(destination), [
        'file:.gitattributes:KiB0ZXh0PWF1dG8K',
        'file:.gitignore:Ki50bXAK',
        'file:LICENSE.md:bGljZW5zZSB0ZXh0',
        'file:collision.txt:cGxhdGZvcm0gd2lucw==',
        'directory:nested',
        'nested/file:.gitkeep:',
        'nested/file:asset.bin:AGFzc2V0w78=',
      ])
      assert.deepEqual(
        await Promise.all([snapshot(platform), snapshot(common)]),
        before
      )
    })
  }

  it('uses host case semantics for Git metadata names', async t => {
    const { platform, common, destination } = await createFixture(t)
    await put(common, '.GiT/config', 'mixed case metadata')
    await put(common, 'nested/.GIT', 'mixed case Git file')
    await put(common, '.GITIGNORE', 'retained')
    copyStaticResources(platform, common, destination)
    assert.equal(
      await readFile(join(destination, '.GITIGNORE'), 'utf8'),
      'retained'
    )
    const copied = (await snapshot(destination)).join('\n')
    assert.equal(copied.includes('.GiT'), process.platform !== 'win32')
    assert.equal(
      copied.includes('nested/file:.GIT:'),
      process.platform !== 'win32'
    )
  })

  it('materializes linked submodule assets without copying metadata or changing the external target', async t => {
    const { root, platform, common, destination } = await createFixture(t)
    const external = join(root, 'external-submodule')
    await put(external, '.git/config', 'repository configuration')
    await put(external, '.git/objects/object', 'repository object')
    await put(external, '_licenses/example.txt', 'license asset')
    await put(external, 'nested/.git', 'gitdir: external metadata')
    await put(external, '.gitignore', '*.draft')
    await put(external, '.gitattributes', '* text=auto')
    await put(external, 'LICENSE.md', 'submodule license')
    await symlink(
      external,
      join(common, 'submodule'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    const before = await Promise.all([snapshot(common), snapshot(external)])

    copyStaticResources(platform, common, destination)

    const output = join(destination, 'submodule')
    assert.equal((await lstat(output)).isSymbolicLink(), false)
    assert.equal(
      await readFile(join(output, '_licenses/example.txt'), 'utf8'),
      'license asset'
    )
    assert.equal(
      await readFile(join(output, 'LICENSE.md'), 'utf8'),
      'submodule license'
    )
    assert.equal(await readFile(join(output, '.gitignore'), 'utf8'), '*.draft')
    assert.equal(
      await readFile(join(output, '.gitattributes'), 'utf8'),
      '* text=auto'
    )
    await assert.rejects(lstat(join(output, '.git')), { code: 'ENOENT' })
    await assert.rejects(lstat(join(output, 'nested/.git')), { code: 'ENOENT' })
    assert.deepEqual(
      await Promise.all([snapshot(common), snapshot(external)]),
      before
    )
  })

  it('copies common resources when the platform directory is absent', async t => {
    const { root, common, destination } = await createFixture(t)
    await put(common, 'asset.txt', 'common asset')
    await put(common, '.git', 'gitdir: private metadata')
    copyStaticResources(join(root, 'missing-platform'), common, destination)
    assert.deepEqual(await snapshot(destination), [
      'file:asset.txt:Y29tbW9uIGFzc2V0',
    ])
  })
})
