import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { AdditionalEditors } from '../../../src/ui/preferences/additional-editors'
import {
  AdditionalEditor,
  customEditorName,
} from '../../../src/lib/editors/configured-editor'
import { getFolderActions } from '../../../src/ui/lib/folder-actions'

describe('configured editors', () => {
  it('lists the default first, deduplicates detected editors and routes custom editors exactly', () => {
    const custom = {
      name: ' My IDE ',
      path: 'D:/Tools/My IDE.exe',
      arguments: '"%TARGET_PATH%"',
    }
    const calls: unknown[][] = []
    const additional: ReadonlyArray<AdditionalEditor> = [
      { editor: 'Notepad++' },
      { editor: 'Cursor' },
      { editor: 'Cursor' },
      { customEditor: custom },
    ]
    const actions = getFolderActions({
      path: 'D:/repo with spaces & symbols',
      missing: false,
      additionalEditors: additional,
      editorLabel: 'Notepad++',
      defaultEditorTarget: 'files-and-folders',
      shellLabel: 'Shell',
      openShell: () => {},
      openEditor: (...args) => calls.push(args),
      reveal: () => {},
      copy: () => {},
    }).filter(a =>
      ['Open in Notepad++', 'Open in Cursor', 'Open in My IDE'].includes(
        a.label ?? ''
      )
    )
    assert.deepEqual(
      actions.map(a => a.label),
      ['Open in Notepad++', 'Open in Cursor', 'Open in My IDE']
    )
    actions.forEach(a => a.action!())
    assert.deepEqual(calls, [
      ['D:/repo with spaces & symbols', undefined],
      ['D:/repo with spaces & symbols', { editor: 'Cursor' }],
      ['D:/repo with spaces & symbols', { customEditor: custom }],
    ])
    assert.equal(customEditorName(null), 'Custom editor')
    assert.equal(customEditorName({ ...custom, name: '  ' }), 'Custom editor')
  })

  it('adds, names and removes custom editors without replacing another editor’s input state', () => {
    let saved: ReadonlyArray<AdditionalEditor> = []
    function Harness() {
      const [editors, setEditors] = React.useState<
        ReadonlyArray<AdditionalEditor>
      >([])
      return (
        <AdditionalEditors
          availableEditors={['Cursor']}
          editors={editors}
          onChange={entries => {
            saved = entries
            setEditors(entries)
          }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByText('Add editor…'))
    fireEvent.change(screen.getByLabelText('Friendly name'), {
      target: { value: 'First' },
    })
    fireEvent.click(screen.getByText('Add editor…'))
    fireEvent.change(screen.getAllByLabelText('Friendly name')[1], {
      target: { value: 'Second' },
    })
    fireEvent.change(screen.getAllByLabelText('Path')[1], {
      target: { value: 'D:/second.exe' },
    })
    fireEvent.click(screen.getAllByText('Remove')[0])
    assert.equal(
      (screen.getByLabelText('Friendly name') as HTMLInputElement).value,
      'Second'
    )
    assert.equal(
      (screen.getByLabelText('Path') as HTMLInputElement).value,
      'D:/second.exe'
    )
    assert.equal(saved[0].customEditor?.path, 'D:/second.exe')
    fireEvent.change(screen.getByLabelText('Editor'), {
      target: { value: 'Cursor' },
    })
    assert.deepEqual(saved, [{ editor: 'Cursor', target: 'files-and-folders' }])
    assert.equal(screen.queryByLabelText('Friendly name'), null)
  })
})
