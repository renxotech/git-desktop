param(
    [string]$UserDataDirectory,
    [ValidateRange(0, 65535)]
    [int]$RemoteDebuggingPort = 0
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskDist = Join-Path $taskRoot 'dist\GitDesktop-Test-win32-x64'
$taskExecutable = Join-Path $taskDist 'GitDesktop-Test.exe'
$taskPackagePath = Join-Path $taskDist 'resources\app\package.json'
if (!(Test-Path -LiteralPath $taskExecutable -PathType Leaf)) {
    throw 'The Test executable is missing. Build it with yarn build:test first.'
}
$taskPackage = Get-Content -LiteralPath $taskPackagePath -Raw | ConvertFrom-Json
if ($taskPackage.productName -ne 'Git Desktop-test') {
    throw 'The selected executable is not packaged with the Test identity.'
}
if ([string]::IsNullOrWhiteSpace($UserDataDirectory)) {
    $UserDataDirectory = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Git Desktop-test'
}
$taskProfile = [IO.Path]::GetFullPath($UserDataDirectory)
if (!(Test-Path -LiteralPath $taskProfile -PathType Container)) {
    throw "Test profile is missing: $taskProfile. Refresh Test from Prod first."
}

# Pin this launch to the permanent Test profile, independently of the caller's
# working directory or any previously used temporary QA profile arguments.
$taskArguments = @('--user-data-dir="' + $taskProfile + '"')
if ($RemoteDebuggingPort -ne 0) {
    # Used only by the restart regression test; normal launches expose no port.
    $taskArguments += '--remote-debugging-address=127.0.0.1'
    $taskArguments += "--remote-debugging-port=$RemoteDebuggingPort"
}
$taskRunAsNode = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')
$taskNodeEnv = [Environment]::GetEnvironmentVariable('NODE_ENV', 'Process')
try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $env:NODE_ENV = 'production'
    $taskStartOptions = @{
        FilePath = $taskExecutable
        WorkingDirectory = $taskDist
        ArgumentList = $taskArguments
        PassThru = $true
    }
    if ($RemoteDebuggingPort -ne 0) {
        $taskStartOptions.WindowStyle = 'Hidden'
    }
    $taskProcess = Start-Process @taskStartOptions
    Write-Output "Executable: $taskExecutable"
    Write-Output "Profile: $taskProfile"
    Write-Output "PID: $($taskProcess.Id)"
} finally {
    [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $taskRunAsNode, 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', $taskNodeEnv, 'Process')
}
