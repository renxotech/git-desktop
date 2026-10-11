import * as Path from 'path'
function aliasKey(path: string): string {
  const normalized = Path.normalize(path)
  return 'worktree-alias:' + (__WIN32__ ? normalized.toLowerCase() : normalized)
}
export function getWorktreeAlias(path: string): string | null {
  return localStorage.getItem(aliasKey(path))
}
export function setWorktreeAlias(path: string, alias: string | null): void {
  const value = alias?.trim()
  if (!value) {
    localStorage.removeItem(aliasKey(path))
  } else {
    localStorage.setItem(aliasKey(path), value)
  }
}
