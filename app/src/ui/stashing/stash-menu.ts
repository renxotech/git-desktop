import { IMenuItem } from '../../lib/menu-item'
import { IStashEntry } from '../../models/stash-entry'

/** Capture the stash SHA, never its changing reflog position. */
export function createStashMenuItems(
  stashes: ReadonlyArray<IStashEntry>,
  onSelect: (stashSha: string) => void
): ReadonlyArray<IMenuItem> {
  if (stashes.length === 0) {
    return [{ label: 'No stashed changes', enabled: false }]
  }

  return stashes.map(stash => ({
    label: stash.branchName.replace(/&/g, '&&'),
    action: () => onSelect(stash.stashSha),
  }))
}
