import * as Path from 'path'

function pinKey(path: string): string {
  const normalized = Path.normalize(path).replace(/[\\/]+$/, '')
  return 'worktree-pin:' + (__WIN32__ ? normalized.toLowerCase() : normalized)
}

export function isWorktreePinned(path: string): boolean {
  return localStorage.getItem(pinKey(path)) === 'true'
}

export function setWorktreePinned(path: string, pinned: boolean): void {
  if (pinned) {
    localStorage.setItem(pinKey(path), 'true')
  } else {
    localStorage.removeItem(pinKey(path))
  }
}
