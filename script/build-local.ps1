param(
    [switch]$Tests,
    [switch]$NonInteractive,
    [switch]$NoLaunch,
    [switch]$LaunchOnly,
    [switch]$AllowDirty,
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskOldLocation = Get-Location
$taskEnvNames = @('NODE_ENV', 'DESKTOP_SKIP_PACKAGE', 'DESKTOP_LOCAL_BUNDLE', 'DESKTOP_BUILD_VERSION', 'DESKTOP_PACKAGE_VERSION', 'DESKTOP_FILE_VERSION', 'DESKTOP_DIST_ROOT')
$taskOldEnv = @{}
foreach ($taskName in $taskEnvNames) {
    $taskOldEnv[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}

function Invoke-Npm {
    param([string[]]$Arguments)
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Build command failed (exit $LASTEXITCODE): npm $($Arguments -join ' ')"
    }
}

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'This build requires Windows PowerShell and Windows Node. From WSL, use bash script/build-local.sh.'
    }
    Set-Location -LiteralPath $taskRoot
    $taskCommon = (& git rev-parse --git-common-dir)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect repository ownership.' }
    $taskCommonRoot = if ([IO.Path]::IsPathRooted($taskCommon)) { [IO.Path]::GetFullPath($taskCommon) } else { [IO.Path]::GetFullPath((Join-Path $taskRoot $taskCommon)) }
    $taskSyncState = Join-Path $taskCommonRoot 'codex-upstream-sync'
    if (Test-Path (Join-Path $taskSyncState 'lock')) {
        $taskActiveFile = Join-Path $taskSyncState 'active.json'
        if (!(Test-Path $taskActiveFile)) { throw 'An upstream sync owns this repository.' }
        $taskActive = Get-Content -LiteralPath $taskActiveFile -Raw | ConvertFrom-Json
        if ([IO.Path]::GetFullPath($taskActive.candidate) -ne $taskRoot) { throw 'An upstream sync owns this repository.' }
    }
    if ($OutputDirectory) {
        $taskOutputRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot $OutputDirectory))
        if (!$taskOutputRoot.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must stay inside this checkout.' }
        if ($taskOutputRoot -eq (Join-Path $taskRoot 'dist')) { throw 'Choose a separate output subdirectory.' }
        $env:DESKTOP_DIST_ROOT = $taskOutputRoot
    }
    . (Join-Path $PSScriptRoot 'build-version.ps1')
    if (!$LaunchOnly) {
        $taskVersion = New-DesktopBuildVersion -AllowDirty:$AllowDirty
        $env:DESKTOP_BUILD_VERSION = $taskVersion.Label
        $env:DESKTOP_PACKAGE_VERSION = $taskVersion.PackageVersion
        $env:DESKTOP_FILE_VERSION = $taskVersion.FileVersion
        Write-Host "Building Git Desktop $($taskVersion.Label)"
    }
    foreach ($taskAsset in @('gemoji\images\emoji', 'gemoji\db\emoji.json', 'app\static\common\choosealicense.com\_licenses', 'app\static\common\gitignore\Global')) {
        if (!(Test-Path -LiteralPath $taskAsset)) {
            throw "Missing submodule asset: $taskAsset. From this checkout, run git submodule update --init before building. npm does not install Git submodules."
        }
    }
    if (!(Test-Path 'node_modules\electron\dist\electron.exe')) {
        throw 'Dependencies are missing. Install them before building.'
    }
    while (!$OutputDirectory -and !$LaunchOnly -and (Get-Process -Name GitDesktop -ErrorAction SilentlyContinue)) {
        if ($NonInteractive) {
            throw 'Close Git Desktop, then rerun the build. The app is using the output files.'
        }
        Write-Host 'Please close Git Desktop before building. Your app will not be stopped automatically.'
        $taskAnswer = Read-Host 'Press Enter after closing it, or type q to cancel'
        if ($taskAnswer -eq 'q') { throw 'Build cancelled.' }
    }

    if (!$LaunchOnly) {
        $env:NODE_ENV = 'production'
        Invoke-Npm -Arguments @('exec', '--', 'cross-env', 'NODE_ENV=production', 'TS_NODE_PROJECT=script/tsconfig.json', 'NODE_OPTIONS=--max_old_space_size=8192', 'webpack', '--config', 'app/webpack.production.ts')
        $env:DESKTOP_SKIP_PACKAGE = '1'
        Invoke-Npm -Arguments @('exec', '--', 'ts-node', '-P', 'script/tsconfig.json', 'script/build.ts')
        $env:DESKTOP_LOCAL_BUNDLE = 'out'
        Invoke-Npm -Arguments @('run', 'package:local')
    }

    $taskDistRoot = if ($OutputDirectory) { $taskOutputRoot } else { Join-Path $taskRoot 'dist' }
    $taskExecutable = Join-Path $taskDistRoot 'GitDesktop-win32-x64\GitDesktop.exe'
    if (!(Test-Path -LiteralPath $taskExecutable)) { throw 'Packaging did not produce the executable.' }
    if (!$LaunchOnly) {
        Complete-DesktopBuildVersion -Version $taskVersion -Executable $taskExecutable
    }
    Write-Host "Executable ready: $taskExecutable" -ForegroundColor Green
    if (!$NoLaunch) {
        $taskRunAsNode = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')
        try {
            Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
            $taskAppProcess = Start-Process -FilePath $taskExecutable -WorkingDirectory (Split-Path -Parent $taskExecutable) -PassThru
            $taskWindowOpened = $false
            for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
                Start-Sleep -Milliseconds 500
                $taskAppProcess.Refresh()
                $taskWindowProcess = Get-Process -Name GitDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.Id -eq $taskAppProcess.Id -or $_.Path -eq $taskExecutable -or [string]::IsNullOrEmpty($_.Path)) } | Select-Object -First 1
                if ($taskWindowProcess) {
                    $taskWindowOpened = $true
                    break
                }
            }
            if (!$taskWindowOpened) {
                if ($taskAppProcess.HasExited) {
                    $taskLaunchFailure = "The app exited during startup (exit $($taskAppProcess.ExitCode))."
                } else {
                    $taskLaunchFailure = 'The app process started, but no window appeared within 10 seconds. It has been left running.'
                }
                throw "$taskLaunchFailure Build is available at $taskExecutable. Retry without rebuilding using -LaunchOnly. App logs are under the Git Desktop profile's logs folder."
            }
            Write-Host "Git Desktop window opened (PID $($taskWindowProcess.Id))."
            if ($taskWindowProcess.Id -ne $taskAppProcess.Id -and [string]::IsNullOrEmpty($taskWindowProcess.Path)) {
                Write-Warning 'An existing Git Desktop window was found, but Windows did not expose its executable path. Close all Git Desktop instances and retry -LaunchOnly to verify this build specifically.'
            }
        } finally {
            [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $taskRunAsNode, 'Process')
        }
    }
    if ($Tests) {
        Write-Host 'The executable is ready. Running tests now; a test failure will leave the build available.'
        Invoke-Npm -Arguments @('run', 'test:unit')
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    foreach ($taskName in $taskEnvNames) {
        [Environment]::SetEnvironmentVariable($taskName, $taskOldEnv[$taskName], 'Process')
    }
    Set-Location -LiteralPath $taskOldLocation
}
