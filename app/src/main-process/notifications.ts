import {
  initializeNotifications,
  onNotificationEvent,
  terminateNotifications,
} from 'desktop-notifications'
import { app, BrowserWindow } from 'electron'
import { findWindowsNotificationIdentity } from '../lib/find-toast-activator-clsid'
import { DesktopAliveEvent } from '../lib/stores/alive-store'
import * as ipcWebContents from './ipc-webcontents'

let initialized = false

export function initializeDesktopNotifications() {
  if (__LINUX__ || initialized) {
    // notifications not currently supported
    return
  }

  if (__DARWIN__) {
    initialized = initializeNotifications({})
    return
  }

  const identity = findWindowsNotificationIdentity()
  if (identity === undefined) {
    log.info(
      'Windows notifications unavailable: this build has no registered notification shortcut.'
    )
    return
  }

  app.setAppUserModelId(identity.appUserModelId)
  initialized = initializeNotifications({
    toastActivatorClsid: identity.toastActivatorClsid,
  })
  if (!initialized) {
    log.warn(
      'Windows notification initialization failed; notifications unavailable'
    )
  }
}

export function terminateDesktopNotifications() {
  terminateNotifications()
  initialized = false
}

export function installNotificationCallback(window: BrowserWindow) {
  onNotificationEvent<DesktopAliveEvent>((event, id, userInfo) => {
    ipcWebContents.send(
      window.webContents,
      'notification-event',
      event,
      id,
      userInfo
    )
  })
}
