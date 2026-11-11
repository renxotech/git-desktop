import { git, GitError, IGitStringExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { IFetchProgress } from '../../models/progress'
import { FetchProgressParser, executionOptionsWithProgress } from '../progress'
import { IRemote } from '../../models/remote'
import { ITrackingBranch } from '../../models/branch'
import { envForRemoteOperation } from './environment'
import { readSandboxRules } from '../sandbox-rule'
import { listWorktrees } from './worktree'

async function getFetchArgs(
  remote: string,
  isBackgroundTask: boolean,
  progressCallback: ((progress: IFetchProgress) => void) | undefined
) {
  return [
    'fetch',
    ...(progressCallback ? ['--progress'] : []),
    '--prune',
    '--recurse-submodules=on-demand',
    // User-initiated fetches must discover every branch, including in clones
    // whose configured fetch refspec only covers a single branch. An empty
    // refmap prevents configured mappings from redirecting these updates.
    ...(!isBackgroundTask ? ['--refmap='] : []),
    '--',
    remote,
    ...(!isBackgroundTask ? [`+refs/heads/*:refs/remotes/${remote}/*`] : []),
  ]
}

/**
 * Fetch from the given remote.
 *
 * @param repository - The repository to fetch into
 *
 * @param account    - The account to use when authenticating with the remote
 *
 * @param remote     - The remote to fetch from
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the fetch operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git fetch'.
 * @param isBackgroundTask  - Whether the fetch is being performed as a
 *                            background task as opposed to being user initiated
 */
export async function fetch(
  repository: Repository,
  remote: IRemote,
  progressCallback?: (progress: IFetchProgress) => void,
  isBackgroundTask = false
): Promise<void> {
  let opts: IGitStringExecutionOptions = {
    successExitCodes: new Set([0]),
    env: await envForRemoteOperation(remote.url),
  }

  if (progressCallback) {
    const title = `Fetching ${remote.name}`
    const kind = 'fetch'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true, isBackgroundTask },
      new FetchProgressParser(),
      progress => {
        // In addition to progress output from the remote end and from
        // git itself, the stderr output from pull contains information
        // about ref updates. We don't need to bring those into the progress
        // stream so we'll just punt on anything we don't know about for now.
        if (progress.kind === 'context') {
          if (!progress.text.startsWith('remote: Counting objects')) {
            return
          }
        }

        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const value = progress.percent

        progressCallback({
          kind,
          title,
          description,
          value,
          remote: remote.name,
        })
      }
    )

    // Initial progress
    progressCallback({ kind, title, value: 0, remote: remote.name })
  }

  const args = await getFetchArgs(
    remote.name,
    isBackgroundTask,
    progressCallback
  )

  await git(args, repository.path, 'fetch', opts)
}

/** Fetch a given refspec from the given remote. */
export async function fetchRefspec(
  repository: Repository,
  remote: IRemote,
  refspec: string
): Promise<void> {
  await git(
    ['fetch', '--', remote.name, refspec],
    repository.path,
    'fetchRefspec',
    {
      successExitCodes: new Set([0, 128]),
      env: await envForRemoteOperation(remote.url),
    }
  )
}

/** Fast-forward tracking branches. */
export async function fastForwardBranches(
  repository: Repository,
  branches: ReadonlyArray<ITrackingBranch>
): Promise<void> {
  // A candidate can become checked out after discovery, so enforce this at the
  // mutation boundary as well. Failed inventory must stop the update.
  while (branches.length > 0) {
    const worktrees = await listWorktrees(repository)
    const checkedOutRefs = new Set(worktrees.map(worktree => worktree.branch))
    const rules = await readSandboxRules(repository.path)
    branches = branches.filter(
      branch =>
        !checkedOutRefs.has(branch.ref) &&
        !rules.some(rule => rule.branch === branch.ref)
    )
    if (branches.length === 0) {
      return
    }

    const refPairs = branches.map(
      branch => `${branch.upstreamRef}:${branch.ref}`
    )

    const args = [
      'fetch',
      '.',
      // Make sure we don't try to update branches that can't be fast-forwarded
      // even if the user disabled this via the git config option
      // `fetch.showForcedUpdates`
      '--show-forced-updates',
      // Prevent `git fetch` from touching the `FETCH_HEAD`
      '--no-write-fetch-head',
      // Take branch refs from stdin to circumvent shell max line length
      // limitations (mainly on Windows)
      '--stdin',
    ]
    const result = await git(args, repository.path, 'fastForwardBranches', {
      // Fetch exits with an exit code of 1 if one or more refs failed to update
      // which is what we expect will happen
      // Inspect 128 locally only to distinguish Git's checkout-race refusal
      // from a genuine failure. Every other 128 is rethrown below.
      successExitCodes: new Set([0, 1, 128]),
      env: {
        // This will make sure the reflog entries are correct after
        // fast-forwarding the branches.
        GIT_REFLOG_ACTION: 'pull',
      },
      stdin: refPairs.join('\n'),
    })
    if (result.exitCode !== 128) {
      return
    }

    const diagnostic = result.stderr.trimEnd()
    const refused = branches.find(branch => {
      const prefix = `fatal: refusing to fetch into branch '${branch.ref}' checked out at '`
      return (
        diagnostic.startsWith(prefix) &&
        diagnostic.length > prefix.length + 1 &&
        diagnostic.endsWith("'") &&
        !diagnostic.includes('\n') &&
        !diagnostic.includes('\r')
      )
    })
    if (refused === undefined) {
      throw new GitError(result, args, result.stderr)
    }

    // Never override Git's guard. Drop this raced branch, refresh the inventory
    // and retry the rest. Every retry removes at least one candidate, bounding
    // attempts by the original candidate count even during repeated checkouts.
    branches = branches.filter(branch => branch.ref !== refused.ref)
  }
}
