$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-output.ps1')
$taskFixture = Join-Path ([IO.Path]::GetTempPath()) ('desktop-output-' + [guid]::NewGuid())
$taskChecks = 0
function Assert-Output($Condition, $Message) {
    if (!$Condition) { throw $Message }
    $script:taskChecks++
}
# Model Windows processes without launching the app or locking real packages.
function Get-Process { param($Name, $ErrorAction) return $script:taskProcesses }
try {
    foreach ($taskScenario in @('running', 'unknown', 'idle')) {
        $taskRoot = Join-Path $taskFixture $taskScenario
        foreach ($taskCounter in 1..3) {
            $taskLabel = 'v2026.11.16_0' + $taskCounter
            $taskOutput = Join-Path $taskRoot ('dist/' + $taskLabel)
            $taskApp = Join-Path $taskOutput 'GitDesktop-win32-x64'
            New-Item -ItemType Directory -Path (Join-Path $taskApp 'resources/app/git/cmd') -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $taskApp 'GitDesktop.exe') -Value 'fixture'
            Set-Content -LiteralPath (Join-Path $taskApp 'resources/app/git/cmd/git.exe') -Value 'fixture Git'
            @{ schema = 1; version = $taskLabel; builtAt = '2026-11-16T10:00:00Z' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskApp 'build-info.json')
            @{ schema = 1; kind = 'git-desktop-default-output'; checkout = $taskRoot; version = $taskLabel } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskOutput '.desktop-build-output.json')
        }
        $taskOld = Join-Path $taskRoot 'dist/v2026.11.16_01'
        $script:taskProcesses = switch ($taskScenario) {
            'running' { [pscustomobject]@{ Path = (Join-Path $taskOld 'GitDesktop-win32-x64/GitDesktop.exe') } }
            'unknown' { [pscustomobject]@{ Path = $null } }
            'idle' { @() }
        }
        Complete-DesktopBuildOutput -Root $taskRoot -Output $taskOutput -Label $taskLabel
        Assert-Output (Test-Path (Join-Path $taskRoot 'dist/v2026.11.16_02/GitDesktop-win32-x64/resources/app/git/cmd/git.exe')) 'Previous successful build must stay intact'
        Assert-Output (Test-Path (Join-Path $taskOutput 'GitDesktop-win32-x64/resources/app/git/cmd/git.exe')) 'Current build must stay intact'
        if ($taskScenario -eq 'idle') {
            Assert-Output (!(Test-Path $taskOld)) 'Idle older build should be removed'
        } else {
            Assert-Output (Test-Path (Join-Path $taskOld 'GitDesktop-win32-x64/resources/app/git/cmd/git.exe')) 'Running or uninspectable builds must retain Git'
        }
    }
    Write-Host "Passed $taskChecks build output checks."
} finally {
    $taskResolved = [IO.Path]::GetFullPath($taskFixture)
    $taskTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (!$taskResolved.StartsWith($taskTemp, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture cleanup escaped temp directory' }
    Remove-Item -LiteralPath $taskResolved -Recurse -Force
}
