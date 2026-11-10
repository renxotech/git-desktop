import pLimit from 'p-limit'
import { git } from './core'
import { listWorktrees } from './worktree'

export interface IBranchTarget {
  readonly ref: string
  readonly name: string
  readonly lastCommitDate?: string
  readonly remote: boolean
}

export interface IUnmergedBranch extends IBranchTarget {
  readonly commitsOnlyInTarget: number
  readonly commitsOutsideTarget: number
  readonly worktreePaths: ReadonlyArray<string>
}

function parseBranchRefs(output: string): IBranchTarget[] {
  return output
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      const [ref, symbolicRef, lastCommitDate] = line.trimEnd().split('\0')
      if (symbolicRef) {
        return []
      }
      return [
        {
          ref,
          lastCommitDate,
          name: ref.replace(/^refs\/(heads|remotes)\//, ''),
          remote: ref.startsWith('refs/remotes/'),
        },
      ]
    })
}

export async function getUnmergedBranchTargets(
  path: string
): Promise<ReadonlyArray<IBranchTarget>> {
  const result = await git(
    [
      'for-each-ref',
      '--format=%(refname)%00%(symref)%00%(committerdate:iso8601)',
      'refs/heads',
      'refs/remotes',
    ],
    path,
    'unmergedBranchTargets'
  )
  return parseBranchRefs(result.stdout)
}

/** Uses ancestry, like git branch --no-merged; squash merges may still appear. */
export async function getUnmergedBranches(
  path: string,
  target = 'HEAD',
  merged = false
): Promise<ReadonlyArray<IUnmergedBranch>> {
  // Resolve once so all counts refer to the same target even if a ref moves.
  const commit = await git(
    ['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`],
    path,
    'unmergedBranchTarget'
  )
  const sha = commit.stdout.trim()
  const result = await git(
    [
      'for-each-ref',
      `${merged ? '--merged' : '--no-merged'}=${sha}`,
      // The last sort key is primary; refname gives equal dates a stable order.
      '--sort=refname',
      '--sort=-committerdate',
      '--format=%(refname)%00%(symref)%00%(committerdate:iso8601)',
      'refs/heads',
      'refs/remotes',
    ],
    path,
    'unmergedBranches'
  )
  const worktrees = await listWorktrees(path)
  const limit = pLimit(6)
  return Promise.all(
    parseBranchRefs(result.stdout).map(branch =>
      limit(async () => {
        const count = await git(
          [
            'rev-list',
            '--left-right',
            '--count',
            `${sha}...${branch.ref}`,
            '--',
          ],
          path,
          'unmergedBranchCount'
        )
        return {
          ...branch,
          commitsOnlyInTarget: Number(count.stdout.trim().split(/\s+/)[0]),
          commitsOutsideTarget: Number(count.stdout.trim().split(/\s+/)[1]),
          worktreePaths: worktrees
            .filter(w => w.branch === branch.ref)
            .map(w => w.path),
        }
      })
    )
  )
}
