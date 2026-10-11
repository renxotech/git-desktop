import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseSandboxRules,
  selectSandboxRelease,
} from '../../src/lib/sandbox-rule'

describe('sandbox rule configuration and release selection', () => {
  it('orders numeric beta suffixes and excludes drafts, tests and stable tags', () => {
    const release = (tag_name: string, prerelease = true, draft = false) => ({
      tag_name,
      prerelease,
      draft,
    })
    const releases = [
      release('release-3.6.7-beta2'),
      release('release-3.6.7-beta10'),
      release('release-4.0.0-beta1', true, true),
      release('release-5.0.0-test1'),
      release('release-6.0.0', false),
    ]
    assert.equal(selectSandboxRelease(releases, 'beta'), 'release-3.6.7-beta10')
    assert.equal(selectSandboxRelease(releases, 'stable'), 'release-6.0.0')
    assert.throws(() =>
      selectSandboxRelease([release('release-1.0.0-beta1')], 'stable')
    )
  })
  it('rejects malformed and unsupported configuration instead of executing it', () => {
    assert.deepEqual(parseSandboxRules(''), [])
    assert.throws(() => parseSandboxRules('{}'))
    assert.throws(() => parseSandboxRules('[{"version":2}]'))
    assert.throws(() => parseSandboxRules('null'))
  })
})
