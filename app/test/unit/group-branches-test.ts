import { sortBranchesByCommitDate } from '../../src/ui/branches/group-branches'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { groupBranches } from '../../src/ui/branches'
import { Branch, BranchType } from '../../src/models/branch'
import { CommitIdentity } from '../../src/models/commit-identity'

describe('Branches grouping', () => {
  const author = new CommitIdentity('Hubot', 'hubot@github.com', new Date())

  const branchTip = {
    sha: '300acef',
    author,
  }

  const currentBranch = new Branch(
    'master',
    null,
    branchTip,
    BranchType.Local,
    ''
  )
  const defaultBranch = new Branch(
    'master',
    null,
    branchTip,
    BranchType.Local,
    ''
  )
  const recentBranches = [
    new Branch('some-recent-branch', null, branchTip, BranchType.Local, ''),
  ]
  const otherBranch = new Branch(
    'other-branch',
    null,
    branchTip,
    BranchType.Local,
    ''
  )

  const allBranches = [currentBranch, ...recentBranches, otherBranch]

  it('should group branches', () => {
    const groups = groupBranches(
      defaultBranch,
      currentBranch,
      allBranches,
      recentBranches
    )
    assert.equal(groups.length, 3)

    assert.equal(groups[0].identifier, 'default')
    let items = groups[0].items
    assert.equal(items[0].branch, defaultBranch)

    assert.equal(groups[1].identifier, 'recent')
    items = groups[1].items
    assert.equal(items[0].branch, recentBranches[0])

    assert.equal(groups[2].identifier, 'other')
    items = groups[2].items
    assert.equal(items[0].branch, otherBranch)
  })
  it('sorts newest tips first with stable ties without mutating the input', () => {
    const branches = ['z-new', 'old', 'a-new'].map(
      name =>
        new Branch(
          name,
          null,
          branchTip,
          BranchType.Local,
          `refs/heads/${name}`
        )
    )
    const sorted = sortBranchesByCommitDate(
      branches,
      new Map([
        [branches[0].ref, 200],
        [branches[1].ref, 100],
        [branches[2].ref, 200],
      ])
    )
    assert.deepEqual(
      sorted.map(b => b.name),
      ['a-new', 'z-new', 'old']
    )
    assert.equal(branches[0].name, 'z-new')
  })
})
