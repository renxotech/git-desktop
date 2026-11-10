# Shared by the local builder and disposable-repository validation.
function Get-DesktopSourceFingerprint {
    $taskDiff = @(Invoke-BuildGit -GitArguments @('diff', '--binary', '--no-ext-diff', '--ignore-submodules=all', 'HEAD', '--')) -join "`n"
    $taskFiles = @(Invoke-BuildGit -GitArguments @('-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'))
    $taskParts = @($taskDiff)
    foreach ($taskFile in $taskFiles) {
        $taskParts += "$taskFile $((Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash)"
    }
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    try {
        return [Convert]::ToBase64String($taskHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($taskParts -join "`n"))))
    } finally {
        $taskHasher.Dispose()
    }
}

function Invoke-BuildGit {
    param([string[]]$GitArguments)
    $taskOutput = & git @GitArguments
    if ($LASTEXITCODE -ne 0) { throw "Git failed: git $($GitArguments -join ' ')" }
    return $taskOutput
}

function New-DesktopBuildVersion {
    param([switch]$AllowDirty, [datetime]$Date = (Get-Date))
    if (@(Invoke-BuildGit -GitArguments @('ls-files', '--unmerged')).Count -gt 0) {
        throw 'Resolve the merge conflicts before building.'
    }
    $taskHead = Invoke-BuildGit -GitArguments @('rev-parse', 'HEAD')
    $taskStatus = @(Invoke-BuildGit -GitArguments @('status', '--porcelain', '--untracked-files=all', '--ignore-submodules'))
    $taskDirty = $taskStatus.Count -gt 0
    if ($taskDirty -and !$AllowDirty) {
        throw 'Commit the pending changes before a tagged build, or use -AllowDirty for an untagged preview.'
    }
    $taskDay = $Date.ToString('yyyy.MM.dd', [Globalization.CultureInfo]::InvariantCulture)
    $taskNext = 1
    foreach ($taskTag in @(Invoke-BuildGit -GitArguments @('tag', '--list', "v${taskDay}_*"))) {
        if ($taskTag -match ('^v' + [regex]::Escape($taskDay) + '_(\d{2,})$')) {
            $taskNext = [Math]::Max($taskNext, [int]$Matches[1] + 1)
        }
    }
    if ($taskNext -gt 65535) { throw 'Daily build counter exceeds the Windows version limit.' }
    $taskTag = 'v{0}_{1:00}' -f $taskDay, $taskNext
    $taskLabel = if ($taskDirty) { "$taskTag-dirty" } else { $taskTag }
    return [pscustomobject]@{
        Tag = $taskTag
        Label = $taskLabel
        PackageVersion = '{0}.{1}.{2}-build.{3}' -f $Date.Year, $Date.Month, $Date.Day, $taskNext
        FileVersion = '{0}.{1}.{2}.{3}' -f $Date.Year, $Date.Month, $Date.Day, $taskNext
        Head = $taskHead
        Dirty = $taskDirty
        Status = ($taskStatus -join "`n")
        Fingerprint = Get-DesktopSourceFingerprint
    }
}

function Complete-DesktopBuildVersion {
    param($Version, [string]$Executable)
    if (!(Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'The packaged executable is missing.' }
    $taskHead = Invoke-BuildGit -GitArguments @('rev-parse', 'HEAD')
    $taskStatus = @(Invoke-BuildGit -GitArguments @('status', '--porcelain', '--untracked-files=all', '--ignore-submodules')) -join "`n"
    if ($taskHead -ne $Version.Head -or $taskStatus -ne $Version.Status -or (Get-DesktopSourceFingerprint) -ne $Version.Fingerprint) {
        throw 'Source state changed during the build; no release tag was created. Rebuild the current source.'
    }
    $taskManifest = [ordered]@{
        schema = 1
        version = $Version.Label
        packageVersion = $Version.PackageVersion
        sourceHead = $Version.Head
        sourceDirty = $Version.Dirty
        builtAt = (Get-Date).ToUniversalTime().ToString('o')
        executableSha256 = (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $taskManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $Executable) 'build-info.json') -Encoding UTF8
    if (!$Version.Dirty) {
        # Git's non-forced create atomically rejects concurrent use of this name.
        Invoke-BuildGit -GitArguments @('tag', '-a', $Version.Tag, $Version.Head, '-m', "Git Desktop $($Version.Label)")
        Write-Host "Created local build tag: $($Version.Tag) (not pushed)"
    } else {
        Write-Host "Built $($Version.Label); dirty previews are not tagged."
    }
}
