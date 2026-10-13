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
if ($hadTestProfile) { Move-Item -LiteralPath $testProfile -Destination $backupProfile }
try {
    Move-Item -LiteralPath $stagingProfile -Destination $testProfile
} catch {
    if ($hadTestProfile) { Move-Item -LiteralPath $backupProfile -Destination $testProfile }
    throw
}
Write-Output "Refreshed $testProfile from $sourceProfile; verified $($sourceFiles.Count) files."
if ($hadTestProfile) { Write-Output "Previous Test profile: $backupProfile" }
