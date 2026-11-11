$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-version.ps1')
$taskFixture = Join-Path ([IO.Path]::GetTempPath()) ('desktop-version-' + [guid]::NewGuid())
$taskPrevious = Get-Location
$taskChecks = 0
function Assert-Version($Condition, $Message) {
    if (!$Condition) { throw $Message }
    $script:taskChecks++
}
function Assert-Rejected($Action, $Pattern) {
    $taskMessage = ''
    try { & $Action } catch { $taskMessage = $_.Exception.Message }
    Assert-Version ($taskMessage -match $Pattern) "Expected rejection matching '$Pattern', got '$taskMessage'"
}
try {
    New-Item -ItemType Directory -Path $taskFixture | Out-Null
    Set-Location -LiteralPath $taskFixture
    Invoke-BuildGit -GitArguments @('init', '--quiet')
    Invoke-BuildGit -GitArguments @('config', 'user.name', 'Build fixture')
    Invoke-BuildGit -GitArguments @('config', 'user.email', 'fixture@example.invalid')
    Set-Content .gitignore 'dist/'
    Set-Content source.txt 'original'
    Invoke-BuildGit -GitArguments @('add', '.')
    Invoke-BuildGit -GitArguments @('commit', '--quiet', '-m', 'fixture')
    $taskDay = [datetime]'2026-11-10'
    $taskVersion = New-DesktopBuildVersion -Date $taskDay
    Assert-Version ($taskVersion.Label -eq 'v2026.11.10_01') 'First daily counter'
    Assert-Version ($taskVersion.PackageVersion -eq '2026.11.10-build.1') 'SemVer representation'
    Assert-Version ($taskVersion.FileVersion -eq '2026.11.10.1') 'Windows representation'
    Assert-Version (@(Invoke-BuildGit -GitArguments @('tag', '--list')).Count -eq 0) 'Allocation must not create tags'
    Assert-Rejected { Complete-DesktopBuildVersion $taskVersion 'missing.exe' } 'missing'
    New-Item -ItemType Directory dist | Out-Null
    Set-Content dist/app.exe 'fixture executable'
    Complete-DesktopBuildVersion $taskVersion (Join-Path $taskFixture 'dist/app.exe')
    Assert-Version ((Invoke-BuildGit -GitArguments @('cat-file', '-t', $taskVersion.Tag)) -eq 'tag') 'Annotated tag'
    $taskInfo = Get-Content dist/build-info.json -Raw | ConvertFrom-Json
    Assert-Version ($taskInfo.sourceHead -eq $taskVersion.Head -and !$taskInfo.sourceDirty -and $taskInfo.executableSha256.Length -eq 64) 'Manifest identity and checksum'
    Assert-Version ((New-DesktopBuildVersion -Date $taskDay).Tag -eq 'v2026.11.10_02') 'Same day increments'
    Assert-Version ((New-DesktopBuildVersion -Date $taskDay.AddDays(1)).Tag -eq 'v2026.11.11_01') 'New day resets'
    Invoke-BuildGit -GitArguments @('tag', 'v2026.11.10_99')
    Invoke-BuildGit -GitArguments @('tag', 'v2026.11.10_bad')
    $taskVersion = New-DesktopBuildVersion -Date $taskDay
    Assert-Version ($taskVersion.Tag -eq 'v2026.11.10_100') 'Counter exceeds 99 and ignores unrelated names'
    Invoke-BuildGit -GitArguments @('tag', $taskVersion.Tag)
    Assert-Rejected { Complete-DesktopBuildVersion $taskVersion 'dist/app.exe' } 'Git failed'
    Set-Content source.txt 'changed'
    Assert-Rejected { New-DesktopBuildVersion -Date $taskDay } 'pending changes'
    $taskVersion = New-DesktopBuildVersion -Date $taskDay -AllowDirty
    Assert-Version ($taskVersion.Label -eq 'v2026.11.10_101-dirty') 'Dirty label'
    Complete-DesktopBuildVersion $taskVersion 'dist/app.exe'
    Assert-Version (@(Invoke-BuildGit -GitArguments @('tag', '--list', $taskVersion.Tag)).Count -eq 0) 'Dirty preview must not tag'
    Set-Content source.txt 'changed again'
    Assert-Rejected { Complete-DesktopBuildVersion $taskVersion 'dist/app.exe' } 'Source state changed'
    $taskVersion = New-DesktopBuildVersion -Date $taskDay -AllowDirty
    Set-Content new.txt 'untracked'
    Assert-Rejected { Complete-DesktopBuildVersion $taskVersion 'dist/app.exe' } 'Source state changed'
    Invoke-BuildGit -GitArguments @('add', '.')
    Invoke-BuildGit -GitArguments @('commit', '--quiet', '-m', 'second')
    $taskVersion = New-DesktopBuildVersion -Date $taskDay
    Invoke-BuildGit -GitArguments @('commit', '--quiet', '--allow-empty', '-m', 'head changed')
    Assert-Rejected { Complete-DesktopBuildVersion $taskVersion 'dist/app.exe' } 'Source state changed'
    Invoke-BuildGit -GitArguments @('checkout', '--quiet', '-b', 'fixture-other')
    Set-Content source.txt 'other branch'
    Invoke-BuildGit -GitArguments @('commit', '--quiet', '-am', 'other')
    Invoke-BuildGit -GitArguments @('checkout', '--quiet', '-b', 'fixture-main', 'HEAD~1')
    Set-Content source.txt 'main branch'
    Invoke-BuildGit -GitArguments @('commit', '--quiet', '-am', 'main')
    & git merge fixture-other 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { throw 'Could not prepare conflict fixture' }
    Assert-Rejected { New-DesktopBuildVersion -Date $taskDay -AllowDirty } 'merge conflicts'
    Write-Host "Passed $taskChecks build version checks."
} finally {
    Set-Location -LiteralPath $taskPrevious
    $taskResolved = [IO.Path]::GetFullPath($taskFixture)
    $taskTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (!$taskResolved.StartsWith($taskTemp, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture cleanup escaped temp directory' }
    Remove-Item -LiteralPath $taskResolved -Recurse -Force
}
