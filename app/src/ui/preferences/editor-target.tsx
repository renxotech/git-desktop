import * as React from 'react'
import { EditorTarget } from '../../lib/editors/configured-editor'
import { Select } from '../lib/select'

export function EditorTargetSelect(props: {
  readonly value: EditorTarget
  readonly onChange: (target: EditorTarget) => void
}) {
  const onChange = React.useCallback(
    (event: React.FormEvent<HTMLSelectElement>) => {
      props.onChange(event.currentTarget.value as EditorTarget)
    },
    [props]
  )
  return (
    <Select label="Opens" value={props.value} onChange={onChange}>
      <option value="files">Files only</option>
      <option value="files-and-folders">Files and folders</option>
    </Select>
  )
}
