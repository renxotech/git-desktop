import assert from 'node:assert/strict'
import { it } from 'node:test'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { runInNewContext } from 'vm'
import webpack from 'webpack'
import { renderer } from '../app/webpack.common'
import { createTempDirectory } from '../app/test/helpers/temp'

it('bundles a rejecting stub instead of the Copilot SDK in a default build', async t => {
  const root = await createTempDirectory(t)
  const entry = join(root, 'entry.js')
  await writeFile(
    entry,
    `import { CopilotClient } from '@github/copilot-sdk'; export const start = () => new CopilotClient();`
  )
  const compiler = webpack({
    ...renderer,
    mode: 'production',
    plugins: [],
    optimization: { minimize: false },
    entry,
    output: {
      path: join(root, 'out'),
      filename: 'bundle.js',
      library: { type: 'commonjs2' },
    },
  })
  assert.ok(compiler)
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        compiler.close(error => (error ? reject(error) : resolve()))
      )
  )
  const stats = await new Promise<webpack.Stats>((resolve, reject) =>
    compiler.run((error, result) => {
      if (error) {
        reject(error)
      } else if (result) {
        resolve(result)
      } else {
        reject(new Error('No compilation result'))
      }
    })
  )
  assert.equal(stats.hasErrors(), false, stats.toString('errors-only'))
  const modules = stats.toJson({ all: false, modules: true }).modules ?? []
  assert.ok(
    !JSON.stringify(modules).includes('node_modules/@github/copilot-sdk')
  )
  const context: { module: { exports: { start?: () => unknown } } } = {
    module: { exports: {} },
  }
  runInNewContext(
    await readFile(join(root, 'out', 'bundle.js'), 'utf8'),
    context
  )
  assert.ok(context.module.exports.start)
  assert.throws(context.module.exports.start, /disabled in this build/)
})
