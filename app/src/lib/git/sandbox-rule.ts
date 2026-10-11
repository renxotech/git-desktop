import * as Path from 'path'
import { createHash } from 'crypto'
import { realpath } from 'fs/promises'
import { pathExists } from '../path-exists'
import { git } from './core'
import { listWorktrees } from './worktree'
import { getRemotes } from './remote'
import { envForRemoteOperation } from './environment'
import { Repository } from '../../models/repository'
import {
  ISandboxRule,
  ISandboxRelease,
  readSandboxRules,
  sandboxRuleConfigKey,
  selectSandboxRelease,
  sandboxRulesChanged,
  selectSandboxTag,
  normalizeSandboxPath,
} from '../sandbox-rule'

const queues = new Map<string, Promise<unknown>>()

/** Explicit recovery preserves the invalid value and rejects stale reset requests. */
export async function resetInvalidSandboxRules(path: string, rawValue: string) {
  await withSandboxRuleQueue(path, async () => {
    const current = await git(
      ['config', '--local', '--get', sandboxRuleConfigKey],
      path,
      'inspectInvalidSandboxRules'
    )
    if (current.stdout !== rawValue) {
      throw new Error(
        'Sandbox configuration changed. Reopen settings before resetting it.'
      )
    }
    await git(
      ['config', '--local', 'desktop.sandboxRulesBackup', rawValue.trimEnd()],
      path,
      'backupInvalidSandboxRules'
    )
    await git(
      ['config', '--local', sandboxRuleConfigKey, '[]'],
      path,
      'resetInvalidSandboxRules'
    )
    sandboxRulesChanged.emit('changed')
  })
}
export async function withSandboxRuleQueue<T>(
  path: string,
  action: () => Promise<T>
): Promise<T> {
  const result = await git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    path,
    'sandboxCommonDir'
  )
  const key = normalizeSandboxPath(await realpath(result.stdout.trim()))
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(action)
  queues.set(key, next)
  try {
    return await next
  } finally {
    if (queues.get(key) === next) {
      queues.delete(key)
    }
  }
}

export async function saveSandboxRule(
  path: string,
  branch: string,
  rule: ISandboxRule | null
): Promise<void> {
  await withSandboxRuleQueue(path, async () => {
    const existingRules = await readSandboxRules(path)
    const previous = existingRules.find(r => r.branch === branch)
    const rules = existingRules.filter(r => r.branch !== branch)
    if (rule) {
      if (rule.branch !== branch) {
        throw new Error('The rule must belong to the selected sandbox branch.')
      }
      await git(
        ['check-ref-format', rule.branch],
        path,
        'validateSandboxBranch'
      )
      if (rule.selector === 'branch') {
        await git(
          ['check-ref-format', `refs/heads/${rule.sourceBranch}`],
          path,
          'validateSandboxSource'
        )
      }
      if (rule.selector === 'tag') {
        await git(
          ['check-ref-format', `refs/tags/${rule.sourceBranch}placeholder`],
          path,
          'validateSandboxTagPrefix'
        )
      }
      const worktrees = await listWorktrees(path)
      const owner = worktrees.find(
        w =>
          normalizeSandboxPath(w.path) ===
          normalizeSandboxPath(rule.worktreePath)
      )
      if (
        !owner ||
        owner.branch !== branch ||
        owner.isLocked ||
        owner.isPrunable
      ) {
        throw new Error(
          'The sandbox must be attached to this branch and available.'
        )
      }
      await assertNoSandboxOperation(owner.path)
      const sameSource =
        previous?.remote === rule.remote &&
        previous.remoteURL === rule.remoteURL &&
        previous.selector === rule.selector &&
        previous.sourceBranch === rule.sourceBranch
      rules.push(
        sameSource
          ? {
              ...rule,
              lastTag: previous?.lastTag,
              lastTagObject: previous?.lastTagObject,
              lastSHA: previous?.lastSHA,
              lastCheckedAt: previous?.lastCheckedAt,
              lastUpdatedAt: previous?.lastUpdatedAt,
              lastStatus: previous?.lastStatus,
              lastMessage: previous?.lastMessage,
              pendingSubmodules: previous?.pendingSubmodules,
            }
          : rule
      )
    }
    await git(
      ['config', '--local', sandboxRuleConfigKey, JSON.stringify(rules)],
      path,
      'saveSandboxRule'
    )
    sandboxRulesChanged.emit('changed')
  })
}

async function assertNoSandboxOperation(path: string) {
  for (const marker of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'BISECT_START',
    'rebase-merge',
    'rebase-apply',
    'sequencer',
  ]) {
    const location = await git(
      ['rev-parse', '--git-path', marker],
      path,
      'sandboxOperationPath'
    )
    if (await pathExists(Path.resolve(path, location.stdout.trim()))) {
      throw new Error('A Git operation is in progress in this sandbox.')
    }
  }
}

export interface ISandboxUpdateResult {
  readonly branch: string
  readonly status: 'current' | 'updated' | 'blocked' | 'failed'
  readonly message: string
}
export type SandboxReleaseLoader = (
  remoteURL: string
) => Promise<ReadonlyArray<ISandboxRelease>>

async function inspectSandboxSubmodules(path: string) {
  const result = await git(
    [
      'submodule',
      'foreach',
      '--quiet',
      '--recursive',
      'printf "%s\\0%s\\0%s\\0" "$displaypath" "$(git rev-parse HEAD)" "$sha1"',
    ],
    path,
    'inspectSandboxSubmodules',
    { sandboxFastForward: true }
  )
  const fields = result.stdout.split('\0')
  const entries: { path: string; head: string; expected: string }[] = []
  for (let i = 0; i + 2 < fields.length; i += 3) {
    entries.push({
      path: fields[i],
      head: fields[i + 1],
      expected: fields[i + 2],
    })
  }
  return entries
}

async function assertSafeSubmoduleRetry(path: string, rule: ISandboxRule) {
  for (const entry of await inspectSandboxSubmodules(path)) {
    const previous = rule.pendingSubmodules?.find(s => s.path === entry.path)
    if (entry.head !== entry.expected && entry.head !== previous?.head) {
      throw new Error(
        `Local submodule commits prevent completion: ${entry.path}`
      )
    }
    const submodulePath = Path.resolve(path, entry.path)
    await assertNoSandboxOperation(submodulePath)
    const status = await git(
      [
        'status',
        '--porcelain',
        '-z',
        '--untracked-files=all',
        '--ignore-submodules=all',
      ],
      submodulePath,
      'sandboxSubmoduleRetryStatus'
    )
    if (status.stdout.length > 0) {
      throw new Error(
        `Local submodule changes prevent completion: ${entry.path}`
      )
    }
  }
}

export async function updateSandboxRules(
  repository: Repository,
  loadReleases: SandboxReleaseLoader,
  fetchedRules?: ReadonlyArray<ISandboxRule>
): Promise<ReadonlyArray<ISandboxUpdateResult>> {
  return withSandboxRuleQueue(repository.path, async () => {
    const rules = await readSandboxRules(repository.path)
    const remotes = await getRemotes(repository)
    const results: ISandboxUpdateResult[] = []
    const releaseCache = new Map<
      string,
      Promise<ReadonlyArray<ISandboxRelease>>
    >()
    const updatedRules: ISandboxRule[] = []
    for (const rule of rules) {
      let saved = rule
      let advanced = false
      try {
        if (
          fetchedRules &&
          !fetchedRules.some(
            r =>
              r.branch === rule.branch &&
              r.remote === rule.remote &&
              r.remoteURL === rule.remoteURL &&
              r.selector === rule.selector &&
              r.sourceBranch === rule.sourceBranch &&
              normalizeSandboxPath(r.worktreePath) ===
                normalizeSandboxPath(rule.worktreePath)
          )
        ) {
          throw new Error(
            'The rule changed during fetch. Fetch again to update this sandbox.'
          )
        }
        const remote = remotes.find(
          r => r.name === rule.remote && r.url === rule.remoteURL
        )
        if (!remote) {
          throw new Error(
            'The configured source remote is missing or its URL changed.'
          )
        }
        const target = await resolveTarget(repository.path, rule, async () => {
          let releases = releaseCache.get(remote.url)
          if (!releases) {
            releases = loadReleases(remote.url)
            releaseCache.set(remote.url, releases)
          }
          return releases
        })
        const worktrees = (await listWorktrees(repository)).filter(
          w => w.branch === rule.branch
        )
        const owner = worktrees[0]
        if (
          worktrees.length !== 1 ||
          !owner ||
          owner.isLocked ||
          owner.isPrunable ||
          normalizeSandboxPath(owner.path) !==
            normalizeSandboxPath(rule.worktreePath)
        ) {
          throw new Error(
            'The configured sandbox is missing, moved, locked, or on another branch.'
          )
        }
        await assertNoSandboxOperation(owner.path)
        const status = await git(
          [
            'status',
            '--porcelain',
            '-z',
            '--untracked-files=all',
            rule.pendingSubmodules
              ? '--ignore-submodules=all'
              : '--ignore-submodules=none',
          ],
          owner.path,
          'sandboxStatus'
        )
        if (status.stdout.length > 0) {
          throw new Error('Local changes prevent updating this sandbox.')
        }
        if (rule.pendingSubmodules) {
          if (owner.head !== rule.lastSHA) {
            throw new Error(
              'The sandbox changed after partial completion. Review its local history before retrying.'
            )
          }
          await assertSafeSubmoduleRetry(owner.path, rule)
        }
        if (owner.head !== target.sha) {
          const ancestor = await git(
            ['merge-base', '--is-ancestor', owner.head, target.sha],
            owner.path,
            'sandboxAncestry',
            { successExitCodes: new Set([0, 1]) }
          )
          if (ancestor.exitCode !== 0) {
            throw new Error(
              'Local commits or divergent history prevent a fast-forward.'
            )
          }
          const head = await git(
            ['rev-parse', 'HEAD'],
            owner.path,
            'sandboxRecheckHead'
          )
          const branch = await git(
            ['symbolic-ref', '--quiet', 'HEAD'],
            owner.path,
            'sandboxRecheckBranch'
          )
          if (
            head.stdout.trim() !== owner.head ||
            branch.stdout.trim() !== rule.branch
          ) {
            throw new Error(
              'The sandbox changed during fetch. Fetch again to retry.'
            )
          }
          const pendingSubmodules = await inspectSandboxSubmodules(owner.path)
          await git(
            ['merge', '--ff-only', '--no-overwrite-ignore', target.sha],
            owner.path,
            'sandboxFastForward',
            {
              sandboxFastForward: true,
              env: await envForRemoteOperation(rule.remoteURL),
              trackLFSProgress: true,
            }
          )
          advanced = true
          saved = {
            ...rule,
            lastTag: target.tag,
            lastTagObject: target.tagObject,
            lastSHA: target.sha,
            lastUpdatedAt: new Date().toISOString(),
            pendingSubmodules,
          }
          const actual = await git(
            ['rev-parse', 'HEAD'],
            owner.path,
            'sandboxVerify'
          )
          if (actual.stdout.trim() !== target.sha) {
            throw new Error('Sandbox did not reach the selected source commit.')
          }
        }
        // Also initializes missing modules when the superproject is current,
        // and retries a recorded partial completion after checking local work.
        if (!saved.pendingSubmodules) {
          saved = {
            ...saved,
            lastSHA: target.sha,
            pendingSubmodules: await inspectSandboxSubmodules(owner.path),
          }
        }
        advanced = advanced || rule.pendingSubmodules !== undefined
        await git(
          ['submodule', 'update', '--init', '--recursive'],
          owner.path,
          'sandboxUpdateSubmodules',
          {
            sandboxFastForward: true,
            env: await envForRemoteOperation(rule.remoteURL),
            trackLFSProgress: true,
          }
        )
        saved = {
          ...saved,
          lastTag: target.tag,
          lastTagObject: target.tagObject,
          lastSHA: target.sha,
          pendingSubmodules: undefined,
        }
        results.push({
          branch: rule.branch,
          status: owner.head === target.sha ? 'current' : 'updated',
          message: target.tag ?? target.sha.substring(0, 10),
        })
      } catch (error) {
        results.push({
          branch: rule.branch,
          status: advanced ? 'failed' : 'blocked',
          message:
            (advanced
              ? 'Branch advanced, but checkout completion failed: '
              : '') + (error instanceof Error ? error.message : String(error)),
        })
      }
      const outcome = results[results.length - 1]
      updatedRules.push({
        ...saved,
        lastCheckedAt: new Date().toISOString(),
        lastStatus: outcome.status,
        lastMessage: outcome.message,
      })
    }
    if (rules.length > 0) {
      await git(
        [
          'config',
          '--local',
          sandboxRuleConfigKey,
          JSON.stringify(updatedRules),
        ],
        repository.path,
        'saveSandboxTargets'
      )
    }
    return results
  })
}

export async function resolveTarget(
  path: string,
  rule: ISandboxRule,
  releases: () => Promise<ReadonlyArray<ISandboxRelease>>
) {
  const remoteURL = await git(
    ['ls-remote', '--get-url', '--', rule.remote],
    path,
    'sandboxSourceIdentity'
  )
  if (remoteURL.stdout.replace(/\r?\n$/, '') !== rule.remoteURL) {
    throw new Error('The source remote URL changed. Review the rule source.')
  }
  if (rule.selector === 'branch') {
    // Resolve only after a fresh, throwing fetch. GitStore's ordinary fetch
    // pipeline reports handled errors without rejecting its promise.
    const sourceID = createHash('sha256')
      .update(rule.remoteURL)
      .digest('hex')
      .substring(0, 16)
    const ref = `refs/desktop-tracking/${sourceID}/heads/${rule.sourceBranch}`
    await git(
      [
        'fetch',
        '--no-tags',
        '--recurse-submodules=no',
        '--no-write-fetch-head',
        '--',
        rule.remoteURL,
        `+refs/heads/${rule.sourceBranch}:${ref}`,
      ],
      path,
      'fetchSandboxBranch',
      { env: await envForRemoteOperation(rule.remoteURL) }
    )
    const resolved = await git(
      ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
      path,
      'sandboxBranchTarget'
    )
    return { sha: resolved.stdout.trim(), tag: undefined, tagObject: undefined }
  }
  const env = await envForRemoteOperation(rule.remoteURL)
  const tag =
    rule.selector === 'tag'
      ? selectSandboxTag(
          (
            await git(
              ['ls-remote', '--tags', '--refs', '--', rule.remoteURL],
              path,
              'sandboxMatchingTags',
              { env }
            )
          ).stdout
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line =>
              line
                .trim()
                .split(/\s+/)[1]
                .replace(/^refs\/tags\//, '')
            ),
          rule.sourceBranch
        )
      : selectSandboxRelease(await releases(), rule.selector)
  const refs = [
    `refs/tags/${tag}`,
    ...(rule.lastTag ? [`refs/tags/${rule.lastTag}`] : []),
  ]
  const advertised = await git(
    ['ls-remote', '--tags', '--', rule.remoteURL, ...refs],
    path,
    'sandboxSourceTags',
    { env }
  )
  const objects = new Map(
    advertised.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [sha, ref] = line.trim().split(/\s+/)
        return [ref, sha] as const
      })
  )
  if (
    rule.lastTag &&
    rule.lastTagObject &&
    objects.get(`refs/tags/${rule.lastTag}`) !== rule.lastTagObject
  ) {
    throw new Error(
      'The previously selected release tag changed or disappeared. Review the rule source.'
    )
  }
  const tagObject = objects.get(`refs/tags/${tag}`)
  if (!tagObject) {
    throw new Error(
      'Published release tag is unavailable on the selected remote.'
    )
  }
  const sourceID = createHash('sha256')
    .update(rule.remoteURL)
    .digest('hex')
    .substring(0, 16)
  const destination = `refs/desktop-tracking/${sourceID}/tags/${tag}`
  await git(
    [
      'fetch',
      '--no-tags',
      '--recurse-submodules=no',
      '--no-write-fetch-head',
      '--',
      rule.remoteURL,
      `refs/tags/${tag}:${destination}`,
    ],
    path,
    'fetchSandboxTag',
    { env }
  )
  const fetched = await git(
    ['rev-parse', '--verify', '--end-of-options', destination],
    path,
    'verifySandboxTag'
  )
  if (fetched.stdout.trim() !== tagObject) {
    throw new Error('The release tag changed during fetch.')
  }
  const commit = await git(
    ['rev-parse', '--verify', '--end-of-options', `${destination}^{commit}`],
    path,
    'peelSandboxTag'
  )
  return { sha: commit.stdout.trim(), tag, tagObject }
}
