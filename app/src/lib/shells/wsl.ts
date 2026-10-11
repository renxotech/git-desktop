import { ChildProcess, spawn } from 'child_process'

/** Open this PC's preferred WSL1 distribution at the selected checkout. */
export function launchWSL(executable: string, path: string): ChildProcess {
  const wslPath = /^\\\\(?:wsl\$|wsl\.localhost)\\([^\\]+)(\\.*)?$/i.exec(path)
  if (wslPath !== null) {
    if (wslPath[1].toLowerCase() !== 'debian-wsl1') {
      throw new Error(
        `This folder belongs to ${wslPath[1]}, but Open in WSL uses Debian-WSL1.`
      )
    }
    // WSL1 need not expose its filesystem through the Windows UNC provider.
    // Inside the explicitly selected distribution, use the native Linux path.
    path = wslPath[2]?.replace(/\\/g, '/') || '/'
  }
  // START's working directory alone does not reliably select WSL's cwd.
  // Pass paths through the environment to keep CMD metacharacters literal.
  // Disable delayed expansion for paths containing !, and escape trailing
  // backslashes before the closing quote (including drive roots such as D:\).
  return spawn(
    process.env.comspec || 'C:\\Windows\\System32\\cmd.exe',
    [
      '/d',
      '/v:off',
      '/s',
      '/c',
      'start "WSL" "%GITHUB_DESKTOP_WSL_EXE%" --distribution Debian-WSL1 --cd "%GITHUB_DESKTOP_WSL_OPEN_PATH%"',
    ],
    {
      windowsVerbatimArguments: true,
      env: {
        ...process.env,
        GITHUB_DESKTOP_WSL_EXE: executable,
        GITHUB_DESKTOP_WSL_OPEN_PATH: path.replace(/(\\+)$/, '$1$1'),
      },
    }
  )
}
