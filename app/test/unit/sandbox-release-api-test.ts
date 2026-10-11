import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { API } from '../../src/lib/api'

describe('published sandbox release lookup', () => {
  it('follows every page before returning a release list', async t => {
    let pages = 0
    t.mock.method(globalThis, 'fetch', async () => {
      pages++
      return new Response(
        JSON.stringify([
          { tag_name: `release-1.0.${pages}`, draft: false, prerelease: false },
        ]),
        {
          headers:
            pages === 1
              ? {
                  Link: '<https://api.github.com/repos/owner/repo/releases?per_page=100&page=2>; rel="next"',
                }
              : {},
        }
      )
    })
    const releases = await new API(
      'https://api.github.com',
      ''
    ).fetchSandboxReleases('owner', 'repo')
    assert.equal(pages, 2)
    assert.equal(releases.length, 2)
  })
  it('rejects a failure on a later page instead of returning a partial result', async t => {
    let pages = 0
    t.mock.method(globalThis, 'fetch', async () => {
      pages++
      if (pages === 2) {
        return new Response(JSON.stringify({ message: 'rate limit' }), {
          status: 403,
        })
      }
      return new Response('[]', {
        headers: {
          Link: '<https://api.github.com/repos/owner/repo/releases?per_page=100&page=2>; rel="next"',
        },
      })
    })
    await assert.rejects(
      new API('https://api.github.com', '').fetchSandboxReleases(
        'owner',
        'repo'
      ),
      /rate limit/
    )
  })
})
