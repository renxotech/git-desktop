import * as path from 'path'
import { app, shell } from 'electron'

export interface IWindowsNotificationIdentity {
  readonly toastActivatorClsid: string
  readonly appUserModelId: string
}

/**
 * Checks all Windows shortcuts created by Squirrel looking for the toast
 * activator CLSID needed to handle Windows notifications from the Action Center.
 */
export function findWindowsNotificationIdentity():
  | IWindowsNotificationIdentity
  | undefined {
  const shortcutPaths = [
    path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'GitHub, Inc',
      'Git Desktop.lnk'
    ),
    path.join(app.getPath('desktop'), 'Git Desktop.lnk'),
  ]

  for (const shortcutPath of shortcutPaths) {
    const identity = findIdentityInShortcut(shortcutPath)

    if (identity !== undefined) {
      return identity
    }
  }

  return undefined
}

function findIdentityInShortcut(
  shortcutPath: string
): IWindowsNotificationIdentity | undefined {
  try {
    const shortcutDetails = shell.readShortcutLink(shortcutPath)

    if (
      shortcutDetails.toastActivatorClsid === undefined ||
      !/^\{[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\}$/i.test(
        shortcutDetails.toastActivatorClsid
      ) ||
      shortcutDetails.appUserModelId !== 'com.squirrel.GitDesktop.GitDesktop'
    ) {
      return undefined
    }

    return {
      toastActivatorClsid: shortcutDetails.toastActivatorClsid,
      appUserModelId: shortcutDetails.appUserModelId,
    }
  } catch {
    // Unpacked local builds do not install Windows shortcuts.
    return undefined
  }
}
