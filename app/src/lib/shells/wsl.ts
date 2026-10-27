import { ChildProcess, spawn } from 'child_process'

/** Open Windows paths in Ubuntu, and WSL paths in their owning distribution. */
export function launchWSL(executable: string, path: string): ChildProcess {
  let distribution = 'Ubuntu'
  const wslPath = /^\\\\(?:wsl\$|wsl\.localhost)\\([^\\]+)(\\.*)?$/i.exec(path)
  if (wslPath !== null) {
    distribution = wslPath[1]
    // Inside the owning distribution, use the native Linux path.
    path = wslPath[2]?.replace(/\\/g, '/') || '/'
  }
  // WSL can treat quotes around a simple distribution name as part of its
  // name when launched through START. Only omit quotes for shell-safe names.
  const distributionArgument = /^[a-z0-9._-]+$/i.test(distribution)
    ? '%GITHUB_DESKTOP_WSL_DISTRIBUTION%'
    : '"%GITHUB_DESKTOP_WSL_DISTRIBUTION%"'
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
      `start "WSL" "%GITHUB_DESKTOP_WSL_EXE%" --distribution ${distributionArgument} --cd "%GITHUB_DESKTOP_WSL_OPEN_PATH%"`,
    ],
    {
      windowsVerbatimArguments: true,
      env: {
        ...process.env,
        GITHUB_DESKTOP_WSL_EXE: executable,
        GITHUB_DESKTOP_WSL_DISTRIBUTION: distribution,
        GITHUB_DESKTOP_WSL_OPEN_PATH: path.replace(/(\\+)$/, '$1$1'),
      },
    }
  )
}
