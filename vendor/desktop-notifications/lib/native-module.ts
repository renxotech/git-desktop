import { supportsNotifications } from './notification-support'
import { notificationCallback } from './notification-callback'
import { DesktopNotificationPermission } from './notification-permission'
import { INotificationOptions } from './notification-options'

// The native binary will be loaded lazily to avoid any possible crash at start
// time, which are harder to trace.
let _nativeModule: any | null | undefined = undefined
let initialized = false

function getNativeModule(): any | null {
  if (_nativeModule !== undefined) {
    return _nativeModule
  }

  _nativeModule = supportsNotifications()
    ? require('../build/Release/desktop-notifications.node')
    : null

  return _nativeModule
}

/** Initializes the desktop-notifications system. */
export const initializeNotifications: (
  opts: INotificationOptions
) => boolean = opts => {
  if (initialized) {
    return true
  }
  const nativeModule = getNativeModule()
  if (nativeModule === null) {
    return false
  }
  // The macOS implementation has a void return; Windows explicitly reports
  // whether all initialization stages succeeded.
  const result = nativeModule.initializeNotifications(notificationCallback, opts)
  initialized = process.platform === 'win32' ? result === true : result !== false
  return initialized
}

/** Terminates the desktop-notifications system. */
export const terminateNotifications: () => void = () => {
  if (initialized) {
    getNativeModule()?.terminateNotifications()
    initialized = false
  }
}

/** Gets the current state of the notifications permission. */
export const getNotificationsPermission: () => Promise<
  DesktopNotificationPermission
> = () =>
  initialized
    ? getNativeModule().getNotificationsPermission()
    : Promise.resolve('default')

/** Requests the user to grant permission to display notifications. */
export const requestNotificationsPermission: () => Promise<boolean> = () =>
  initialized
    ? getNativeModule().requestNotificationsPermission()
    : Promise.resolve(false)

/**
 * Displays a system notification.
 * @param title Title of the notification
 * @param body Body of the notification
 * @param userInfo (Optional) An object with any information that needs to be
 * passed to the notification callback when the user clicks on the notification.
 * @returns The ID of the notification displayed. This ID can be used to close
 * the notification. Returns null if native submission fails.
 */
export const showNotification: (
  title: string,
  body: string,
  userInfo?: Record<string, any>
) => Promise<string | null> = async (...args) => {
  if (!initialized) {
    return null
  }
  const id = crypto.randomUUID()
  try {
    await getNativeModule()?.showNotification(id, ...args)
  } catch (e) {
    return null
  }
  return id
}

/** Closes the notification with the given ID. */
export const closeNotification: (id: string) => void = (...args) => {
  if (initialized) {
    getNativeModule()?.closeNotification(...args)
  }
}
