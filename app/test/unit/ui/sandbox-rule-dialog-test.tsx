import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../../helpers/repositories'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { SandboxRuleDialog } from '../../../src/ui/worktrees/sandbox-rule-dialog'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { Popup, PopupType } from '../../../src/models/popup'
import {
  readSandboxRules,
  isSandboxProtected,
} from '../../../src/lib/sandbox-rule'

describe('sandbox rule settings', () => {
  it('exposes invalid configuration and explicitly backs up and resets it', async t => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })
    const repo = await setupEmptyRepository(t, 'master')
    await exec(['commit', '--allow-empty', '-m', 'base'], repo.path)
    const raw = '{invalid JSON'
    await exec(['config', '--local', 'desktop.sandboxRules', raw], repo.path)
    let changed = false
    render(
      <SandboxRuleDialog
        repository={repo}
        accounts={[]}
        dispatcher={{} as Dispatcher}
        worktreePath={repo.path}
        onChanged={() => {
          changed = true
        }}
        onDismissed={() => {}}
      />
    )
    await waitFor(() => assert.ok(screen.getByText(raw)))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Back up and reset all rules',
        hidden: true,
      })
    )
    await waitFor(() => assert.equal(changed, true))
    assert.deepEqual(await readSandboxRules(repo.path), [])
    assert.equal(
      (
        await exec(
          ['config', '--local', '--get', 'desktop.sandboxRulesBackup'],
          repo.path
        )
      ).stdout.trimEnd(),
      raw
    )
  })
  it('saves, reloads, disables, and creates a working sandbox without moving the original', async t => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    t.after(() => {
      electron.ipcRenderer.send = previousSend
    })
    const repo = await setupEmptyRepository(t, 'master')
    await exec(['commit', '--allow-empty', '-m', 'base'], repo.path)
    await exec(['remote', 'add', 'upstream', repo.path], repo.path)
    const original = (
      await exec(['rev-parse', 'HEAD'], repo.path)
    ).stdout.trim()
    const popups: Popup[] = []
    const dispatcher = {
      showPopup: (popup: Popup) => {
        popups.push(popup)
      },
    } as unknown as Dispatcher
    let changed = 0
    const onChanged = () => {
      changed++
    }
    const onDismissed = () => {}
    const props = {
      repository: repo,
      accounts: [],
      dispatcher,
      worktreePath: repo.path,
      onChanged,
      onDismissed,
    }
    const view = render(<SandboxRuleDialog {...props} />)
    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText('Follow') as HTMLSelectElement).disabled,
        false
      )
    )
    fireEvent.change(screen.getByLabelText('Follow'), {
      target: { value: 'branch' },
    })
    fireEvent.change(screen.getByLabelText('Source branch'), {
      target: { value: 'master' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save rule', hidden: true })
    )
    await waitFor(() => assert.equal(changed, 1))
    assert.equal(await isSandboxProtected(repo.path), true)
    assert.equal((await readSandboxRules(repo.path))[0].remote, 'upstream')
    view.unmount()
    render(<SandboxRuleDialog {...props} />)
    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText('Follow') as HTMLSelectElement).value,
        'branch'
      )
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create working sandbox…',
        hidden: true,
      })
    )
    await waitFor(() => assert.equal(popups.length, 1))
    const popup = popups[0]
    assert.equal(popup.type, PopupType.AddWorktree)
    if (popup.type !== PopupType.AddWorktree) {
      throw new Error('Expected AddWorktree')
    }
    assert.equal(popup.initialStartPoint, original)
    assert.equal(popup.initialSandboxRule, undefined)
    assert.equal(
      (await exec(['rev-parse', 'HEAD'], repo.path)).stdout.trim(),
      original
    )
    fireEvent.change(screen.getByLabelText('Follow'), {
      target: { value: 'off' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save rule', hidden: true })
    )
    await waitFor(() => assert.equal(changed, 2))
    assert.equal(await isSandboxProtected(repo.path), false)
  })
})
