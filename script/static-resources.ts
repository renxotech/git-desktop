/* eslint-disable no-sync */

import { cpSync, existsSync, rmSync } from 'fs'
import * as path from 'path'

/** Stage static assets without copying repository metadata into the package. */
export function copyStaticResources(
  platformSpecific: string,
  common: string,
  destination: string
): void {
  const filter = (source: string) => {
    const name = path.basename(source)
    return (process.platform === 'win32' ? name.toLowerCase() : name) !== '.git'
  }
  // Materialize resource links here so the filter also visits their contents.
  // Leaving a submodule junction intact would let the packager subsequently
  // dereference its unfiltered target, including the target's Git metadata.
  const options = { recursive: true, dereference: true, filter }

  rmSync(destination, { recursive: true, force: true })
  if (existsSync(platformSpecific)) {
    cpSync(platformSpecific, destination, options)
  }
  cpSync(common, destination, { ...options, force: false })
}
