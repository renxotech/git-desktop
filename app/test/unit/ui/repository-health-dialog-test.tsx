import { createTempDirectory } from '../../helpers/temp'
import { Branch, BranchType } from '../../../src/models/branch'

import { Repository } from '../../../src/models/repository'

import assert from 'node:assert/strict'

import { describe, it } from 'node:test'

import * as React from 'react'

import { writeFile } from 'fs/promises'

import * as Path from 'path'

import { setupEmptyRepository } from '../../helpers/repositories'

import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

import { RepositoryHealthDialog } from '../../../src/ui/repositories-list/repository-health-dialog'

import { UnmergedBranchesDialog } from '../../../src/ui/branches/unmerged-branches-dialog'

import { Dispatcher } from '../../../src/ui/dispatcher'

import {
  HealthOperation,
  IRepositoryHealth,
  IHealthOperationResult,
} from '../../../src/lib/repository-health'

import { git } from '../../../src/lib/git/core'

const onDismissed = () => {}

describe('repository health dialogs', () => {
  it('omits submodules from registered repository health results', async t => {
    const electron = await import('electron')

    const previousSend = electron.ipcRenderer.send

    electron.ipcRenderer.send = () => {}

    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })

    const parent = await setupEmptyRepository(t)

    const source = await setupEmptyRepository(t)

    await git(
      ['commit', '--allow-empty', '-m', 'base'],

      source.path,

      'healthDialogTest'
    )

    await git(
      [
        '-c',

        'protocol.file.allow=always',

        'submodule',

        'add',

        source.path,

        'module',
      ],

      parent.path,

      'healthDialogTest'
    )

    const submodule = new Repository(
      Path.join(parent.path, 'module'),

      9999,

      null,

      false
    )

    const view = render(
      <RepositoryHealthDialog
        repositories={[parent, submodule]}
        dispatcher={{} as Dispatcher}
        onDismissed={onDismissed}
      />
    )

    await waitFor(
      () =>
        assert.equal(
          view.container.querySelectorAll('.health-repository').length,

          1
        ),

      { timeout: 10000 }
    )

    view.unmount()
  })

  it('fetches only selected visible repositories and retains operation errors', async t => {
    const electron = await import('electron')

    const previousSend = electron.ipcRenderer.send

    electron.ipcRenderer.send = () => {}

    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })

    const dirty = await setupEmptyRepository(t)

    const clean = await setupEmptyRepository(t)

    await writeFile(Path.join(dirty.path, 'local.txt'), 'dirty')

    for (const args of [
      ['commit', '--allow-empty', '-m', 'base'],

      ['remote', 'add', 'origin', clean.path],

      ['update-ref', 'refs/remotes/origin/master', 'HEAD'],

      ['branch', '--set-upstream-to=origin/master'],
    ]) {
      await git(args, clean.path, 'healthDialogTest')
    }

    const performed: string[][] = []

    const dispatcher = {
      async performRepositoryHealthOperation(
        repositories: ReadonlyArray<IRepositoryHealth>,

        operation: HealthOperation,

        _signal: AbortSignal,

        onResult: (result: IHealthOperationResult) => void
      ) {
        assert.equal(operation, 'fetch')

        performed.push(repositories.map(r => r.path))

        onResult({
          path: dirty.path,

          messages: [],

          errors: ['Remote fetch failed'],
        })
      },
    } as unknown as Dispatcher

    const view = render(
      <RepositoryHealthDialog
        repositories={[dirty, clean]}
        dispatcher={dispatcher}
        onDismissed={onDismissed}
      />
    )

    await waitFor(
      () =>
        assert.ok(
          screen.getByRole('button', {
            name: 'Fetch selected (1)',

            hidden: true,
          })
        ),

      { timeout: 15000 }
    )

    assert.match(view.container.textContent ?? '', /local.txt/)

    fireEvent.click(screen.getByLabelText('Needs attention only'))

    assert.ok(
      screen.getByRole('button', { name: 'Fetch selected (2)', hidden: true })
    )

    fireEvent.click(screen.getByLabelText('Needs attention only'))

    fireEvent.click(
      screen.getByRole('button', { name: 'Fetch selected (1)', hidden: true })
    )

    await waitFor(() => assert.equal(performed.length, 1))

    assert.deepEqual(performed[0], [dirty.path])

    await waitFor(
      () =>
        assert.ok(
          screen.getByRole('button', {
            name: 'Fetch selected (1)',

            hidden: true,
          })
        ),

      { timeout: 15000 }
    )

    assert.ok(screen.getByText('Remote fetch failed'))

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear selection', hidden: true })
    )

    assert.equal(
      screen

        .getByRole('button', { name: 'Fetch selected (0)', hidden: true })

        .getAttribute('aria-disabled'),

      'true'
    )

    view.unmount()
  })

  it('updates the unmerged list when the comparison target changes', async t => {
    const electron = await import('electron')

    const previousSend = electron.ipcRenderer.send

    electron.ipcRenderer.send = () => {}

    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })

    const repository = await setupEmptyRepository(t)

    for (const args of [
      ['commit', '--allow-empty', '-m', 'base'],

      ['checkout', '-b', 'feature'],

      ['commit', '--allow-empty', '-m', 'feature'],

      ['checkout', 'master'],
    ]) {
      await git(args, repository.path, 'unmergedDialogTest')
    }

    const view = render(
      <UnmergedBranchesDialog
        dispatcher={{} as Dispatcher}
        allBranches={[]}
        currentBranch={null}
        defaultBranch={null}
        repository={repository}
        onDismissed={onDismissed}
      />
    )

    await waitFor(() => assert.ok(screen.getByText('1 unmerged branches')), {
      timeout: 15000,
    })

    fireEvent.change(screen.getByLabelText('Not merged into'), {
      target: { value: 'refs/heads/feature' },
    })

    await waitFor(() => assert.ok(screen.getByText('No matching branches.')), {
      timeout: 15000,
    })

    assert.equal(
      view.container.querySelectorAll('.unmerged-branch-results li').length,

      0
    )

    view.unmount()
  })

  it('selects a merged branch for confirmed removal and protects the current branch', async t => {
    const electron = await import('electron')

    const previousSend = electron.ipcRenderer.send

    electron.ipcRenderer.send = () => {}

    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })

    const repository = await setupEmptyRepository(t)

    await git(
      ['commit', '--allow-empty', '-m', 'base'],

      repository.path,

      'mergedDialogTest'
    )

    await git(['branch', 'finished'], repository.path, 'mergedDialogTest')

    const sha = (
      await git(['rev-parse', 'HEAD'], repository.path, 'mergedDialogTest')
    ).stdout.trim()

    const current = new Branch(
      'master',

      null,

      { sha },

      BranchType.Local,

      'refs/heads/master'
    )

    const finished = new Branch(
      'finished',

      null,

      { sha },

      BranchType.Local,

      'refs/heads/finished'
    )

    const view = render(
      <UnmergedBranchesDialog
        repository={repository}
        dispatcher={{} as Dispatcher}
        merged={true}
        allBranches={[current, finished]}
        currentBranch={current}
        defaultBranch={current}
        onDismissed={onDismissed}
      />
    )

    await waitFor(() => assert.ok(screen.getByText('2 merged branches')), {
      timeout: 15000,
    })

    fireEvent.click(screen.getByRole('radio', { name: /master/, hidden: true }))

    assert.ok(screen.getByText('The current branch cannot be removed.'))

    fireEvent.click(
      screen.getByRole('radio', { name: /finished/, hidden: true })
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Remove Branch/, hidden: true })
    )

    assert.ok(screen.getByRole('button', { name: 'Delete', hidden: true }))

    view.unmount()
  })
  it('merges the selected candidate directly without another branch picker', async t => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })
    const repository = await setupEmptyRepository(t)
    await git(
      ['commit', '--allow-empty', '-m', 'base'],
      repository.path,
      'mergeDialogTest'
    )
    const base = (
      await git(['rev-parse', 'HEAD'], repository.path, 'mergeDialogTest')
    ).stdout.trim()
    await git(['checkout', '-b', 'feature'], repository.path, 'mergeDialogTest')
    await git(
      ['commit', '--allow-empty', '-m', 'feature'],
      repository.path,
      'mergeDialogTest'
    )
    const sha = (
      await git(['rev-parse', 'HEAD'], repository.path, 'mergeDialogTest')
    ).stdout.trim()
    await git(['checkout', 'master'], repository.path, 'mergeDialogTest')
    const current = new Branch(
      'master',
      null,
      { sha: base },
      BranchType.Local,
      'refs/heads/master'
    )
    const feature = new Branch(
      'feature',
      null,
      { sha },
      BranchType.Local,
      'refs/heads/feature'
    )
    let mergedBranch: Branch | undefined
    const dispatcher = {
      mergeFromBranchList: async (_repository: Repository, branch: Branch) => {
        mergedBranch = branch
      },
    } as unknown as Dispatcher
    const view = render(
      <UnmergedBranchesDialog
        repository={repository}
        dispatcher={dispatcher}
        allBranches={[current, feature]}
        currentBranch={current}
        defaultBranch={current}
        onDismissed={onDismissed}
      />
    )
    await waitFor(() => assert.ok(screen.getByText('1 unmerged branches')), {
      timeout: 15000,
    })
    fireEvent.click(
      screen.getByRole('radio', { name: /feature/, hidden: true })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Merge', hidden: true }))
    await waitFor(() => assert.equal(mergedBranch, feature), { timeout: 15000 })
    view.unmount()
  })
  it('checks linked worktree files only when combined removal is requested', async t => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })
    const repository = await setupEmptyRepository(t)
    await git(
      ['commit', '--allow-empty', '-m', 'base'],
      repository.path,
      'combinedRemovalDialogTest'
    )
    const sha = (
      await git(
        ['rev-parse', 'HEAD'],
        repository.path,
        'combinedRemovalDialogTest'
      )
    ).stdout.trim()
    const linked = Path.join(await createTempDirectory(t), 'linked')
    await git(
      ['worktree', 'add', '-b', 'finished', linked],
      repository.path,
      'combinedRemovalDialogTest'
    )
    await writeFile(Path.join(linked, 'unsaved.txt'), 'preserve me')
    const current = new Branch(
      'master',
      null,
      { sha },
      BranchType.Local,
      'refs/heads/master'
    )
    const finished = new Branch(
      'finished',
      null,
      { sha },
      BranchType.Local,
      'refs/heads/finished'
    )
    const view = render(
      <UnmergedBranchesDialog
        repository={repository}
        dispatcher={{} as Dispatcher}
        merged={true}
        allBranches={[current, finished]}
        currentBranch={current}
        defaultBranch={current}
        onDismissed={onDismissed}
      />
    )
    await waitFor(() => assert.ok(screen.getByText('2 merged branches')), {
      timeout: 15000,
    })
    fireEvent.click(
      screen.getByRole('radio', { name: /finished/, hidden: true })
    )
    assert.equal(
      screen.queryByText(/Uncommitted or untracked files are present/),
      null
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /Remove worktree and branch/,
        hidden: true,
      })
    )
    await waitFor(
      () =>
        assert.ok(
          screen.getByText(/Uncommitted or untracked files are present/)
        ),
      { timeout: 15000 }
    )
    assert.equal(
      screen
        .getByRole('button', {
          name: 'Remove worktree and branch',
          hidden: true,
        })
        .getAttribute('aria-disabled'),
      'true'
    )
    view.unmount()
  })
})
