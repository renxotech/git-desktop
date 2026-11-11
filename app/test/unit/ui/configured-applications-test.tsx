import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { AdditionalShells } from '../../../src/ui/preferences/additional-shells'
import { AdditionalShell } from '../../../src/lib/shells/configured-shell'
import { Shell } from '../../../src/lib/shells/win32'
import {
  configuredEditorActions,
  AdditionalEditor,
} from '../../../src/lib/editors/configured-editor'
import { getFolderActions } from '../../../src/ui/lib/folder-actions'
import { Integrations } from '../../../src/ui/preferences/integrations'

describe('editor and shell configuration', () => {
  it('offers both editor kinds for files and only folder-capable editors for folders', () => {
    const additional: ReadonlyArray<AdditionalEditor> = [
      { editor: 'Notepad++' },
      { editor: 'VSCodium' },
      {
        customEditor: {
          name: 'File tool',
          path: 'tool.exe',
          arguments: '%TARGET_PATH%',
        },
        target: 'files',
      },
    ]
    assert.deepEqual(
      configuredEditorActions('Windows Notepad', additional, 'file').map(
        e => e.name
      ),
      ['Windows Notepad', 'Notepad++', 'VSCodium', 'File tool']
    )
    assert.deepEqual(
      configuredEditorActions('Windows Notepad', additional, 'folder').map(
        e => e.name
      ),
      ['VSCodium']
    )
    assert.deepEqual(
      configuredEditorActions(
        'Windows Notepad',
        [],
        'folder',
        'files-and-folders'
      ).map(e => e.name),
      ['Windows Notepad']
    )
  })

  it('uses only the configured shells, deduplicates the default, and passes custom shell arguments unchanged', () => {
    const customShell = {
      name: 'My terminal',
      path: 'D:/tools/terminal.exe',
      arguments: '--working-directory "%TARGET_PATH%"',
    }
    const calls: unknown[][] = []
    const actions = getFolderActions({
      path: "D:/work/100% & user's repo",
      missing: false,
      shellLabel: Shell.Cmd,
      additionalShells: [
        { shell: Shell.Cmd },
        { shell: Shell.WSL },
        { customShell },
      ],
      editorLabel: 'Windows Notepad',
      additionalEditors: [],
      openShell: (...args) => calls.push(args),
      openEditor: () => {},
      reveal: () => {},
      copy: () => {},
    })
    assert.equal(
      actions.some(a => a.label === 'Open in PowerShell'),
      false
    )
    assert.equal(
      actions.some(a => a.label === 'Open in Windows Notepad'),
      false
    )
    assert.equal(
      actions.filter(a => a.label === 'Open in Command Prompt').length,
      1
    )
    actions.find(a => a.label === 'Open in WSL')!.action!()
    actions.find(a => a.label === 'Open in My terminal')!.action!()
    assert.deepEqual(calls, [
      ["D:/work/100% & user's repo", { shell: Shell.WSL }],
      ["D:/work/100% & user's repo", { customShell }],
    ])
  })

  it('adds detected and custom shells and preserves surviving draft values after removal', () => {
    let saved: ReadonlyArray<AdditionalShell> = []
    function Harness() {
      const [shells, setShells] = React.useState<
        ReadonlyArray<AdditionalShell>
      >([])
      return (
        <AdditionalShells
          availableShells={[Shell.Cmd, Shell.WSL]}
          shells={shells}
          onChange={entries => {
            saved = entries
            setShells(entries)
          }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByText('Add shell…'))
    fireEvent.change(screen.getByLabelText('Shell'), {
      target: { value: Shell.WSL },
    })
    assert.deepEqual(saved, [{ shell: Shell.WSL }])
    fireEvent.click(screen.getByText('Add shell…'))
    fireEvent.change(screen.getByLabelText('Friendly name'), {
      target: { value: 'My terminal' },
    })
    fireEvent.change(screen.getByLabelText('Path'), {
      target: { value: 'D:/terminal.exe' },
    })
    fireEvent.click(screen.getAllByText('Remove')[0])
    assert.equal(
      (screen.getByLabelText('Path') as HTMLInputElement).value,
      'D:/terminal.exe'
    )
    assert.equal((saved[0] as AdditionalShell).customShell?.name, 'My terminal')
    assert.equal(screen.queryByLabelText('Opens'), null)
  })

  it('exposes common editor/shell choices and the default editor target control in settings', () => {
    const targets: string[] = []
    const noop = () => {}
    render(
      <Integrations
        availableEditors={['Windows Notepad', 'Notepad++', 'VSCodium']}
        selectedExternalEditor="Windows Notepad"
        availableShells={[Shell.Cmd, Shell.WSL]}
        selectedShell={Shell.Cmd}
        useCustomEditor={false}
        customEditor={{ path: '', arguments: '%TARGET_PATH%' }}
        useCustomShell={false}
        customShell={{ path: '', arguments: '%TARGET_PATH%' }}
        copilotAppPath=""
        additionalEditors={[]}
        additionalShells={[]}
        defaultEditorTarget={null}
        onDefaultEditorTargetChanged={value => targets.push(value)}
        onAdditionalEditorsChanged={noop}
        onAdditionalShellsChanged={noop}
        onSelectedEditorChanged={noop}
        onSelectedShellChanged={noop}
        onUseCustomEditorChanged={noop}
        onCustomEditorChanged={noop}
        onUseCustomShellChanged={noop}
        onCustomShellChanged={noop}
        onCopilotAppPathChanged={noop}
      />
    )
    const editor = screen.getByLabelText('External editor') as HTMLSelectElement
    assert.ok(Array.from(editor.options).some(o => o.value === 'Notepad++'))
    const shell = screen.getByLabelText('Shell') as HTMLSelectElement
    assert.deepEqual(
      Array.from(shell.options)
        .slice(0, 2)
        .map(o => o.value),
      [Shell.Cmd, Shell.WSL]
    )
    assert.equal(
      (screen.getByLabelText('Opens') as HTMLSelectElement).value,
      'files'
    )
    fireEvent.change(screen.getByLabelText('Opens'), {
      target: { value: 'files-and-folders' },
    })
    assert.deepEqual(targets, ['files-and-folders'])
  })
})
