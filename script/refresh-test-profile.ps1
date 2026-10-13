$ErrorActionPreference = 'Stop'
$profileRoot = [Environment]::GetFolderPath('ApplicationData')
$sourceProfile = Join-Path $profileRoot 'Git Desktop'
$testProfile = Join-Path $profileRoot 'Git Desktop-test'

function Assert-AppsClosed {
    $runningApps = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -match '^(GitDesktop.*|GitHubDesktop.*|electron)\.exe$'
    })
    if ($runningApps.Count -gt 0) {
        throw 'Close Desktop and Electron apps before refreshing Test from Prod.'
    }
}

Assert-AppsClosed
if (!(Test-Path -LiteralPath $sourceProfile -PathType Container)) {
    throw "Production profile does not exist: $sourceProfile"
}
foreach ($profile in @($sourceProfile, $testProfile)) {
    if (Test-Path -LiteralPath $profile) {
        $items = @((Get-Item -LiteralPath $profile)) + @(Get-ChildItem -LiteralPath $profile -Recurse -Force)
        if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) {
            throw "Profile contains a junction or symbolic link: $profile"
        }
    }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stagingProfile = Join-Path $profileRoot "Git Desktop-test.staging-$stamp"
$backupProfile = Join-Path $profileRoot "Git Desktop-test.backup-$stamp"
Copy-Item -LiteralPath $sourceProfile -Destination $stagingProfile -Recurse -Force
$sourceFiles = @(Get-ChildItem -LiteralPath $sourceProfile -File -Recurse -Force)
$copiedFiles = @(Get-ChildItem -LiteralPath $stagingProfile -File -Recurse -Force)
if ($sourceFiles.Count -ne $copiedFiles.Count) { throw "Copy count mismatch; staging retained at $stagingProfile" }
foreach ($file in $sourceFiles) {
    $relativePath = $file.FullName.Substring($sourceProfile.Length)
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath ($stagingProfile + $relativePath)).Hash) {
        throw "Copy verification failed: $relativePath; staging retained at $stagingProfile"
    }
}
Assert-AppsClosed
$hadTestProfile = Test-Path -LiteralPath $testProfile
if ($hadTestProfile) { [IO.Directory]::Move($testProfile, $backupProfile) }
try {
    # Directory.Move fails if the destination exists; Move-Item can silently
    # nest staging inside a profile recreated between the process check and move.
    [IO.Directory]::Move($stagingProfile, $testProfile)
} catch {
    if ($hadTestProfile -and !(Test-Path -LiteralPath $testProfile)) {
        [IO.Directory]::Move($backupProfile, $testProfile)
    }
    throw
}
$installedFiles = @(Get-ChildItem -LiteralPath $testProfile -File -Recurse -Force)
if ($sourceFiles.Count -ne $installedFiles.Count) { throw "Installed profile count mismatch; previous Test profile retained at $backupProfile" }
foreach ($file in $sourceFiles) {
    $relativePath = $file.FullName.Substring($sourceProfile.Length)
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath ($testProfile + $relativePath)).Hash) {
        throw "Installed profile verification failed: $relativePath; previous Test profile retained at $backupProfile"
    }
}
Write-Output "Refreshed $testProfile from $sourceProfile; verified $($sourceFiles.Count) files."
if ($hadTestProfile) { Write-Output "Previous Test profile: $backupProfile" }
