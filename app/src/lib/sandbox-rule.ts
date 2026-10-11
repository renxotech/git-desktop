import { exec } from 'dugite'
import * as Path from 'path'
import { compare, valid } from 'semver'
import { EventEmitter } from 'events'

export const sandboxRulesChanged = new EventEmitter()

export function normalizeSandboxPath(path: string): string {
  const normalized = Path.resolve(path)
  return __WIN32__ ? normalized.toLowerCase() : normalized
}

export async function isSandboxProtected(path: string): Promise<boolean> {
  const rules = await readSandboxRules(path)
  if (!rules.length) {
    return false
  }
  const head = await exec(['symbolic-ref', '--quiet', 'HEAD'], path)
  if (head.exitCode !== 0 && head.exitCode !== 1) {
    throw new Error('Unable to resolve the sandbox branch.')
  }
  return rules.some(r => r.branch === head.stdout.trim())
}

export async function assertSandboxWritable(path: string): Promise<void> {
  if (await isSandboxProtected(path)) {
    throw new Error(
      'This sandbox has a fast-forward rule. Create a working sandbox or disable the rule before making changes.'
    )
  }
}

export type SandboxSelector = 'branch' | 'beta' | 'stable' | 'tag'
export interface ISandboxRule {
  readonly version: 1
  readonly branch: string
  readonly worktreePath: string
  readonly remote: string
  readonly remoteURL: string
  readonly selector: SandboxSelector
  readonly sourceBranch: string
  readonly lastTag?: string
  readonly lastTagObject?: string
  readonly lastSHA?: string
  readonly lastCheckedAt?: string
  readonly lastUpdatedAt?: string
  readonly lastStatus?: string
  readonly lastMessage?: string
  readonly pendingSubmodules?: ReadonlyArray<{
    readonly path: string
    readonly head: string
  }>
}

export const sandboxRuleConfigKey = 'desktop.sandboxRules'

export class InvalidSandboxRulesError extends Error {
  public constructor(public readonly rawValue: string) {
    super(
      'Invalid sandbox rules. Open fast-forward rule settings to inspect or reset them.'
    )
  }
}

export function parseSandboxRules(value: string): ReadonlyArray<ISandboxRule> {
  if (!value.trim()) {
    return []
  }
  const rules: unknown = JSON.parse(value)
  if (!Array.isArray(rules)) {
    throw new Error(
      'Invalid sandbox rules. Open fast-forward rule settings to repair them.'
    )
  }
  const branches = new Set<string>()
  for (const rule of rules) {
    if (
      rule === null ||
      typeof rule !== 'object' ||
      rule.version !== 1 ||
      typeof rule.branch !== 'string' ||
      !rule.branch.startsWith('refs/heads/') ||
      branches.has(rule.branch) ||
      typeof rule.worktreePath !== 'string' ||
      !Path.isAbsolute(rule.worktreePath) ||
      typeof rule.remote !== 'string' ||
      !rule.remote ||
      typeof rule.remoteURL !== 'string' ||
      !rule.remoteURL ||
      !['branch', 'beta', 'stable', 'tag'].includes(rule.selector) ||
      typeof rule.sourceBranch !== 'string' ||
      (rule.pendingSubmodules !== undefined &&
        (!Array.isArray(rule.pendingSubmodules) ||
          rule.pendingSubmodules.some(
            (s: unknown) =>
              s === null ||
              typeof s !== 'object' ||
              typeof (s as { path?: unknown }).path !== 'string' ||
              typeof (s as { head?: unknown }).head !== 'string' ||
              !/^[0-9a-f]{40,64}$/.test((s as { head: string }).head)
          ))) ||
      (rule.lastTag !== undefined && typeof rule.lastTag !== 'string') ||
      (rule.lastTagObject !== undefined &&
        !/^[0-9a-f]{40,64}$/.test(rule.lastTagObject)) ||
      (rule.lastSHA !== undefined && !/^[0-9a-f]{40,64}$/.test(rule.lastSHA)) ||
      ['lastCheckedAt', 'lastUpdatedAt', 'lastStatus', 'lastMessage'].some(
        key => rule[key] !== undefined && typeof rule[key] !== 'string'
      )
    ) {
      throw new Error(
        'Invalid sandbox rule configuration; no updates were applied.'
      )
    }
    branches.add(rule.branch)
  }
  return rules as ISandboxRule[]
}

/** Local Git config is shared by linked worktrees and is never published. */
export async function readSandboxRules(
  path: string
): Promise<ReadonlyArray<ISandboxRule>> {
  const result = await exec(
    ['config', '--local', '--get', sandboxRuleConfigKey],
    path
  )
  if (result.exitCode === 1) {
    return []
  }
  if (result.exitCode !== 0) {
    throw new Error('Unable to read sandbox fast-forward rules.')
  }
  try {
    return parseSandboxRules(result.stdout)
  } catch {
    throw new InvalidSandboxRulesError(result.stdout)
  }
}

export interface ISandboxRelease {
  readonly tag_name: string
  readonly draft: boolean
  readonly prerelease: boolean
}

export function selectSandboxRelease(
  releases: ReadonlyArray<ISandboxRelease>,
  selector: 'beta' | 'stable'
): string {
  const pattern =
    selector === 'beta'
      ? /^release-\d+\.\d+\.\d+-beta\d+$/
      : /^release-\d+\.\d+\.\d+$/
  const tags = releases
    .filter(
      r =>
        !r.draft &&
        r.prerelease === (selector === 'beta') &&
        pattern.test(r.tag_name) &&
        valid(r.tag_name.substring(8)) !== null
    )
    .map(r => r.tag_name)
  // GitHub Desktop uses beta10 rather than beta.10. Normalize the numeric
  // suffix so beta10 sorts after beta2 rather than lexicographically before it.
  const sortable = (tag: string) =>
    tag.substring(8).replace(/-beta(\d+)$/, '-beta.$1')
  tags.sort((a, b) => compare(sortable(a), sortable(b)))
  const tag = tags[tags.length - 1]
  if (!tag) {
    throw new Error(`No published ${selector} release matches release tags.`)
  }
  return tag
}

export function selectSandboxTag(
  tags: ReadonlyArray<string>,
  prefix: string
): string {
  const sortable = (tag: string) =>
    tag.substring(prefix.length).replace(/-beta(\d+)$/, '-beta.$1')
  const matching = tags.filter(
    tag => tag.startsWith(prefix) && valid(sortable(tag)) !== null
  )
  matching.sort((a, b) => compare(sortable(a), sortable(b)))
  const latest = matching[matching.length - 1]
  if (!latest) {
    throw new Error('No semantic-version tags match the configured prefix.')
  }
  return latest
}

const protectedCommands = new Set([
  'commit',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'reset',
  'checkout',
  'switch',
  'restore',
  'stash',
  'clean',
  'apply',
  'am',
  'push',
  'pull',
  'update-ref',
  'update-index',
  'add',
  'submodule',
])

/** Shared enforcement for app-owned Git mutations, including non-UI callers. */
export async function assertSandboxMutationAllowed(
  args: ReadonlyArray<string>,
  path: string
): Promise<void> {
  let position = 0
  while (args[position]?.startsWith('-')) {
    const option = args[position++]
    if (
      option === '-c' ||
      option === '-C' ||
      option === '--git-dir' ||
      option === '--work-tree'
    ) {
      position++
    }
  }
  const command = args[position]
  if (
    !protectedCommands.has(command) &&
    command !== 'branch' &&
    command !== 'worktree'
  ) {
    return
  }
  if (
    ['merge', 'rebase', 'cherry-pick', 'revert', 'am'].includes(command) &&
    ['--abort', '--quit'].includes(args[position + 1])
  ) {
    return
  }
  if (command === 'submodule' && args[position + 1] === 'status') {
    return
  }
  const rules = await readSandboxRules(path)
  if (rules.length === 0) {
    return
  }
  const head = await exec(['symbolic-ref', '--quiet', 'HEAD'], path)
  if (head.exitCode !== 0 && head.exitCode !== 1) {
    throw new Error('Unable to resolve the sandbox branch.')
  }
  const current = rules.find(r => r.branch === head.stdout.trim())
  // Creating another branch/worktree is an escape route, not a mutation of
  // the protected sandbox. Renaming/deleting branches is guarded separately.
  if (command === 'branch') {
    if (
      !args.some(a =>
        [
          '-d',
          '-D',
          '-m',
          '-M',
          '-f',
          '--delete',
          '--move',
          '--force',
        ].includes(a)
      )
    ) {
      return
    }
  }
  if (
    command === 'worktree' &&
    (args[position + 1] === 'add' || args[position + 1] === 'list')
  ) {
    return
  }
  // Filenames and commit messages are not branch targets. Inspect only commands
  // that can explicitly mutate a different branch or worktree.
  const operands = args.slice(position + 1)
  const matchesBranch = (value: string, rule: ISandboxRule) =>
    value === rule.branch || value === rule.branch.substring(11)
  const targeted = rules.find(r => {
    if (command === 'branch' || command === 'update-ref') {
      return operands.some(a => matchesBranch(a, r))
    }
    if (command === 'worktree') {
      return operands
        .slice(1)
        .some(
          a =>
            !a.startsWith('-') &&
            normalizeSandboxPath(a) === normalizeSandboxPath(r.worktreePath)
        )
    }
    if (command === 'push') {
      if (operands.includes('--all') || operands.includes('--mirror')) {
        return true
      }
      const separator = operands.indexOf('--')
      const pushOperands: string[] = []
      if (separator >= 0) {
        pushOperands.push(...operands.slice(separator + 1))
      } else {
        for (let i = 0; i < operands.length; i++) {
          const operand = operands[i]
          if (
            [
              '--repo',
              '--receive-pack',
              '--exec',
              '-o',
              '--push-option',
            ].includes(operand)
          ) {
            i++
            continue
          }
          if (!operand.startsWith('-')) {
            pushOperands.push(operand)
          }
        }
      }
      // First positional operand is the remote, not a refspec.
      return pushOperands.slice(1).some(a => {
        const refspec = a.replace(/^\+/, '')
        return (
          refspec.split(':').some(ref => matchesBranch(ref, r)) ||
          refspec.includes('*')
        )
      })
    }
    if (command === 'checkout' || command === 'switch') {
      const forceBranch = operands.findIndex(
        a => a === '-B' || a === '-C' || a === '--force-create'
      )
      return forceBranch >= 0 && matchesBranch(operands[forceBranch + 1], r)
    }
    return false
  })
  if (current || targeted) {
    throw new Error(
      'This sandbox has a fast-forward rule. Create a working sandbox or disable the rule before making changes.'
    )
  }
}
