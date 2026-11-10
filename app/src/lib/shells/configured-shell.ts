import { ICustomIntegration } from '../custom-integration'
import { Shell } from './shared'

export type AdditionalShell =
  | { readonly shell: Shell; readonly customShell?: never }
  | { readonly shell?: never; readonly customShell: ICustomIntegration }

export function customShellName(shell: ICustomIntegration | null): string {
  return shell?.name?.trim() || 'Custom shell'
}

export function configuredShellActions(
  defaultName: string,
  additional: ReadonlyArray<AdditionalShell>
) {
  const actions: Array<{ name: string; shell?: AdditionalShell }> = [
    { name: defaultName },
  ]
  const seen = new Set([defaultName])
  for (const shell of additional) {
    if (shell.shell !== undefined) {
      if (seen.has(shell.shell)) {
        continue
      }
      seen.add(shell.shell)
    }
    actions.push({
      name: shell.shell ?? customShellName(shell.customShell),
      shell,
    })
  }
  return actions
}
