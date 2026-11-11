import * as React from 'react'
import {
  AdditionalEditor,
  EditorTarget,
  suggestedEditorTarget,
} from '../../lib/editors/configured-editor'
import { TargetPathArgument } from '../../lib/custom-integration'
import { EditorTargetSelect } from './editor-target'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { CustomIntegrationForm } from './custom-integration-form'

interface IAdditionalEditorsProps {
  readonly kind?: 'editor' | 'shell'
  readonly availableEditors: ReadonlyArray<string>
  readonly editors: ReadonlyArray<AdditionalEditor>
  readonly onChange: (editors: ReadonlyArray<AdditionalEditor>) => void
}

interface IEditorRowProps {
  readonly kind?: 'editor' | 'shell'
  readonly entry: AdditionalEditor
  readonly index: number
  readonly availableEditors: ReadonlyArray<string>
  readonly onChange: (index: number, editor: AdditionalEditor) => void
  readonly onRemove: (index: number) => void
}

class EditorRow extends React.Component<IEditorRowProps> {
  private onSelectedEditorChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const editor = event.currentTarget.value
    this.props.onChange(
      this.props.index,
      editor === 'custom'
        ? { customEditor: { path: '', arguments: TargetPathArgument } }
        : { editor, target: suggestedEditorTarget(editor) }
    )
  }

  private onTargetChanged = (target: EditorTarget) =>
    this.props.onChange(this.props.index, { ...this.props.entry, target })

  private onRemove = () => this.props.onRemove(this.props.index)

  private updateCustomEditor = (
    changes: Partial<NonNullable<AdditionalEditor['customEditor']>>
  ) => {
    const { entry, index, onChange } = this.props
    if (entry.customEditor !== undefined) {
      onChange(index, {
        ...entry,
        customEditor: { ...entry.customEditor, ...changes },
      })
    }
  }

  private onNameChanged = (name: string) => this.updateCustomEditor({ name })
  private onPathChanged = (path: string, bundleID?: string) =>
    this.updateCustomEditor({ path, bundleID })
  private onArgumentsChanged = (args: string) =>
    this.updateCustomEditor({ arguments: args })

  public render() {
    const { entry, index, availableEditors, kind = 'editor' } = this.props
    const options = [
      ...new Set([
        ...availableEditors,
        ...(entry.editor ? [entry.editor] : []),
      ]),
    ]
    return (
      <fieldset>
        <Row>
          <Select
            label={kind === 'shell' ? 'Shell' : 'Editor'}
            value={entry.editor ?? 'custom'}
            onChange={this.onSelectedEditorChanged}
          >
            {options.map(editor => (
              <option key={editor} value={editor}>
                {editor}
              </option>
            ))}
            <option value="custom">
              {kind === 'shell' ? 'Custom shell…' : 'Custom editor…'}
            </option>
          </Select>
          <Button onClick={this.onRemove}>Remove</Button>
        </Row>
        {kind === 'editor' && (
          <Row>
            <EditorTargetSelect
              value={entry.target ?? suggestedEditorTarget(entry.editor)}
              onChange={this.onTargetChanged}
            />
          </Row>
        )}
        {entry.customEditor !== undefined && (
          <>
            <Row>
              <TextBox
                label="Friendly name"
                value={entry.customEditor.name ?? ''}
                onValueChanged={this.onNameChanged}
              />
            </Row>
            <Row>
              <CustomIntegrationForm
                reportInvalidValues={true}
                id={`additional-editor-${index}`}
                path={entry.customEditor.path}
                arguments={entry.customEditor.arguments}
                onPathChanged={this.onPathChanged}
                onArgumentsChanged={this.onArgumentsChanged}
              />
            </Row>
          </>
        )}
      </fieldset>
    )
  }
}

/** Edits the optional folder-menu entries without changing the default editor. */
export function AdditionalEditors(props: IAdditionalEditorsProps) {
  const nextKey = React.useRef(props.editors.length)
  const [keys, setKeys] = React.useState(() => props.editors.map((_, i) => i))
  const update = React.useCallback(
    (index: number, editor: AdditionalEditor) =>
      props.onChange(props.editors.map((e, i) => (i === index ? editor : e))),
    [props]
  )
  const remove = React.useCallback(
    (index: number) => {
      setKeys(keys.filter((_, i) => i !== index))
      props.onChange(props.editors.filter((_, i) => i !== index))
    },
    [keys, props]
  )
  const add = React.useCallback(() => {
    setKeys([...keys, nextKey.current++])
    props.onChange([
      ...props.editors,
      { customEditor: { name: '', path: '', arguments: TargetPathArgument } },
    ])
  }, [keys, props])

  return (
    <fieldset>
      <legend>
        <h3>
          {props.kind === 'shell' ? 'Additional shells' : 'Additional editors'}
        </h3>
      </legend>
      <p>
        Configured applications appear in repository and worktree “Open in”
        menus when they support folders.
      </p>
      {props.editors.map((entry, index) => (
        <EditorRow
          key={keys[index]}
          kind={props.kind}
          entry={entry}
          index={index}
          availableEditors={props.availableEditors}
          onChange={update}
          onRemove={remove}
        />
      ))}
      <Row>
        <Button onClick={add}>
          {props.kind === 'shell' ? 'Add shell…' : 'Add editor…'}
        </Button>
      </Row>
    </fieldset>
  )
}
