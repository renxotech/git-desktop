import { IMenuItem } from '../../lib/menu-item'
import {
  AdditionalShell,
  configuredShellActions,
} from '../../lib/shells/configured-shell'
import {
  AdditionalEditor,
  EditorTarget,
  configuredEditorActions,
} from '../../lib/editors/configured-editor'
import { RevealInFileManagerLabel } from './context-menu'

export interface IFolderActions {
  readonly path: string
  readonly missing: boolean
  readonly additionalShells?: ReadonlyArray<AdditionalShell>
  readonly defaultEditorTarget?: EditorTarget
  readonly additionalEditors: ReadonlyArray<AdditionalEditor>
  readonly editorLabel: string | undefined
  readonly shellLabel: string
  readonly openShell: (path: string, shell?: AdditionalShell) => void
  readonly openEditor: (path: string, editor?: AdditionalEditor) => void
  readonly reveal: (path: string) => void
  readonly copy: (path: string) => void
}

/** Shared by the current checkout and repository/worktree context menus. */
export function getFolderActions(
  config: IFolderActions
): ReadonlyArray<IMenuItem> {
  const { path, missing } = config
  const items: IMenuItem[] = configuredShellActions(
    config.shellLabel,
    config.additionalShells ?? []
  ).map(entry => ({
    label: `Open in ${entry.name}`,
    action: () =>
      entry.shell === undefined
        ? config.openShell(path)
        : config.openShell(path, entry.shell),
    enabled: !missing,
  }))
  return [
    ...items,
    ...configuredEditorActions(
      config.editorLabel,
      config.additionalEditors,
      'folder',
      config.defaultEditorTarget
    ).map(entry => ({
      label: `Open in ${entry.name}`,
      action: () => config.openEditor(path, entry.editor),
      enabled: !missing,
    })),
    {
      label: __WIN32__ ? 'Open in Explorer' : RevealInFileManagerLabel,
      action: () => config.reveal(path),
      enabled: !missing,
    },
    { type: 'separator' },
    { label: 'Copy path', action: () => config.copy(path) },
  ]
}
