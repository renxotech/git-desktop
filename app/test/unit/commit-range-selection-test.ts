import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getCommitRangeSelection } from '../../src/lib/commit-range-selection'

describe('combined diff range selection', () => {
  it('includes intervening commits in history order regardless of click order', () => {
    const history = ['newest', 'new', 'middle', 'old', 'oldest']
    assert.deepEqual(getCommitRangeSelection(history, ['old', 'new'], false), [
      'new',
      'middle',
      'old',
    ])
    assert.deepEqual(
      getCommitRangeSelection(history, ['oldest', 'middle', 'newest'], false),
      history
    )
  })

  it('rejects filtered matches, missing endpoints, and single selections', () => {
    assert.equal(getCommitRangeSelection(['a', 'c'], ['a', 'c'], true), null)
    assert.equal(getCommitRangeSelection(['a', 'b'], ['a', 'c'], false), null)
    assert.equal(getCommitRangeSelection(['a', 'b'], ['a'], false), null)
    assert.equal(getCommitRangeSelection([], [], false), null)
  })
})
