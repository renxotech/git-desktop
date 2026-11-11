import * as React from 'react'
import { AdditionalShell } from '../../lib/shells/configured-shell'
import { Shell } from '../../lib/shells'
import { AdditionalEditor } from '../../lib/editors/configured-editor'
import { AdditionalEditors } from './additional-editors'

export function AdditionalShells(props: {
  readonly availableShells: ReadonlyArray<Shell>
  readonly shells: ReadonlyArray<AdditionalShell>
  readonly onChange: (shells: ReadonlyArray<AdditionalShell>) => void
}) {
  const onChange = React.useCallback(
    (entries: ReadonlyArray<AdditionalEditor>) => {
      props.onChange(
        entries.map(entry =>
          entry.editor !== undefined
            ? { shell: entry.editor as Shell }
            : { customShell: entry.customEditor }
        )
      )
    },
    [props]
  )
  const entries: ReadonlyArray<AdditionalEditor> = props.shells.map(entry =>
    entry.shell !== undefined
      ? { editor: entry.shell }
      : { customEditor: entry.customShell }
  )
  return (
    <AdditionalEditors
      kind="shell"
      availableEditors={props.availableShells}
      editors={entries}
      onChange={onChange}
    />
  )
}
