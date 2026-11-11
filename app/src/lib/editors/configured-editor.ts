import { ICustomIntegration } from '../custom-integration'

export type EditorTarget = 'files' | 'files-and-folders'

/** Defaults for known file-oriented editors; user settings can override these. */
export function suggestedEditorTarget(name: string | undefined): EditorTarget {
  return ['Windows Notepad', 'Notepad++'].includes(name ?? '')
    ? 'files'
    : 'files-and-folders'
}

/** An optional editor shown alongside the default in folder menus. */
export type AdditionalEditor = { readonly target?: EditorTarget } & (
  | { readonly editor: string; readonly customEditor?: never }
  | { readonly editor?: never; readonly customEditor: ICustomIntegration }
)

export function customEditorName(editor: ICustomIntegration | null): string {
  return editor?.name?.trim() || 'Custom editor'
}

/** Keep the default first and avoid repeating detected editors. */
export function configuredEditorActions(
  defaultName: string | undefined,
  additional: ReadonlyArray<AdditionalEditor>,
  target: 'file' | 'folder' = 'folder',
  defaultTarget: EditorTarget = suggestedEditorTarget(defaultName)
): ReadonlyArray<{
  readonly name: string
  readonly editor?: AdditionalEditor
}> {
  const actions: Array<{ name: string; editor?: AdditionalEditor }> = [
    ...(target === 'file' || defaultTarget === 'files-and-folders'
      ? [{ name: defaultName || 'external editor' }]
      : []),
  ]
  const seen = new Set(actions.map(action => action.name))
  for (const editor of additional) {
    if (
      target === 'folder' &&
      (editor.target ?? suggestedEditorTarget(editor.editor)) === 'files'
    ) {
      continue
    }
    if (editor.editor !== undefined) {
      if (seen.has(editor.editor)) {
        continue
      }
      seen.add(editor.editor)
    }
    actions.push({
      name: editor.editor ?? customEditorName(editor.customEditor),
      editor,
    })
  }
  return actions
}
