import * as Path from 'path'

import { IMenuItem } from '../../lib/menu-item'
import { writeClipboardText } from '../main-process-proxy'

interface IWorktreeContextMenuConfig {
  readonly folderActions?: ReadonlyArray<IMenuItem>
  readonly path: string
  readonly isMainWorktree: boolean
  readonly isLocked: boolean
  readonly alias?: string | null
  readonly onChangeAlias?: (path: string) => void
  readonly onSandboxRule?: (path: string) => void
  readonly onRemoveAlias?: (path: string) => void
  readonly onRenameWorktree?: (path: string) => void
  readonly onRemoveWorktree?: (path: string) => void
}

export function generateWorktreeContextMenuItems(
  config: IWorktreeContextMenuConfig
): ReadonlyArray<IMenuItem> {
  const { path, isMainWorktree, isLocked, onRenameWorktree, onRemoveWorktree } =
    config
  const name = Path.basename(path)
  const items = new Array<IMenuItem>()

  if (config.onSandboxRule !== undefined) {
    items.push({
      label: 'Fast-forward rule…',
      action: () => config.onSandboxRule?.(path),
    })
  }

  if (config.onChangeAlias !== undefined) {
    items.push({
      label: config.alias ? 'Change alias…' : 'Create alias…',
      action: () => config.onChangeAlias?.(path),
    })
  }
  if (config.alias && config.onRemoveAlias !== undefined) {
    items.push({
      label: 'Remove alias',
      action: () => config.onRemoveAlias?.(path),
    })
  }
  if (onRenameWorktree !== undefined) {
    items.push({
      label: 'Rename…',
      action: () => onRenameWorktree(path),
      enabled: !isMainWorktree && !isLocked,
    })
  }

  items.push({
    label: __DARWIN__ ? 'Copy Worktree Name' : 'Copy worktree name',
    action: () => writeClipboardText(name),
  })

  if (config.folderActions === undefined) {
    items.push({
      label: __DARWIN__ ? 'Copy Worktree Path' : 'Copy worktree path',
      action: () => writeClipboardText(path),
    })
  }

  items.push({ type: 'separator' })

  if (config.folderActions !== undefined) {
    items.push(...config.folderActions, { type: 'separator' })
  }

  if (onRemoveWorktree !== undefined) {
    items.push({
      label: 'Delete…',
      action: () => onRemoveWorktree(path),
      enabled: !isMainWorktree && !isLocked,
    })
  }

  return items
}
