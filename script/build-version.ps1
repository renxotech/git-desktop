# Paths excluded only from local build identity, never from upstream sync cleanliness.
# Keep this list narrow: Markdown under docs/ and these exact prose guides are
# not consumed by webpack, resource preparation, or local application packaging.
$script:DesktopBuildProseFiles = @('AGENTS.md', 'README.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md', 'Codex-ToDo.md', 'TODO.md', '.github/CONTRIBUTING.md', '.github/copilot-instructions.md')

function Test-DesktopBuildDocumentationPath {
    param([string]$Path)
    return $Path -cmatch '(?s)\Adocs/.+\.md\z' -or $script:DesktopBuildProseFiles -ccontains $Path
}

function Get-DesktopBuildStatus {
    # Read NUL records directly: quoted paths, spaces and embedded newlines must
    # not change classification. Disabling rename detection checks both endpoints
    # independently, so moving source into docs/ still leaves a source deletion.
    $taskStart = New-Object Diagnostics.ProcessStartInfo
    $taskStart.FileName = 'git'
    $taskStart.Arguments = 'status --porcelain=v1 -z --no-renames --untracked-files=all --ignore-submodules=all'
    $taskStart.WorkingDirectory = (Get-Location).Path
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    $taskStart.RedirectStandardOutput = $true
    $taskStart.RedirectStandardError = $true
    $taskStart.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $taskProcess = New-Object Diagnostics.Process
    $taskProcess.StartInfo = $taskStart
    try {
        [void]$taskProcess.Start()
        $taskError = $taskProcess.StandardError.ReadToEndAsync()
        $taskOutput = $taskProcess.StandardOutput.ReadToEnd()
        $taskProcess.WaitForExit()
        if ($taskProcess.ExitCode -ne 0) { throw "Git failed while inspecting build source: $($taskError.Result)" }
        foreach ($taskRecord in $taskOutput.Split([char]0)) {
            if ($taskRecord.Length -eq 0) { continue }
            if ($taskRecord.Length -lt 4) { throw 'Malformed Git build status record.' }
            if (!(Test-DesktopBuildDocumentationPath -Path $taskRecord.Substring(3))) { $taskRecord }
        }
    } finally {
        $taskProcess.Dispose()
    }
}

# Shared by the local builder and disposable-repository validation.
function Get-DesktopSourceFingerprint {
    $taskPathspecs = @('.', ':(exclude,glob)docs/**/*.md') + @($script:DesktopBuildProseFiles | ForEach-Object { ':(exclude,literal)' + $_ })
    $taskDiff = @(Invoke-BuildGit -GitArguments (@('diff', '--binary', '--no-ext-diff', '--ignore-submodules=all', 'HEAD', '--') + $taskPathspecs)) -join "`n"
    $taskIndexDiff = @(Invoke-BuildGit -GitArguments (@('diff', '--cached', '--binary', '--no-ext-diff', '--ignore-submodules=all', '--') + $taskPathspecs)) -join "`n"
    $taskFiles = @(Get-DesktopBuildStatus | Where-Object { $_.StartsWith('?? ') } | ForEach-Object { $_.Substring(3) })
    $taskParts = @($taskDiff, $taskIndexDiff)
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
    $taskStatus = @(Get-DesktopBuildStatus)
    $taskDirty = $taskStatus.Count -gt 0
    if ($taskDirty -and !$AllowDirty) {
        throw 'Commit the pending changes to build inputs before a tagged build, or use -AllowDirty for an untagged preview.'
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
    $taskStatus = @(Get-DesktopBuildStatus) -join "`n"
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
