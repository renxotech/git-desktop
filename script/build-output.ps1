# Default outputs are owned only after version finalization succeeds.
function Get-DesktopOutputVersion {
    param([string]$Label)
    if ($Label -cmatch '^v(\d{4})\.(\d{2})\.(\d{2})_(\d{2,})(-dirty)?$') {
        return [version](('{0}.{1}.{2}.{3}' -f $Matches[1], $Matches[2], $Matches[3], $Matches[4]))
    }
    return $null
}

function Assert-DesktopOutputPath {
    param([string]$Root, [string]$Path)
    $taskRootPath = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $taskPath = [IO.Path]::GetFullPath($Path)
    if (!$taskPath.StartsWith($taskRootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Build output must stay inside its expected root.'
    }
    # Refuse junctions/symlinks, including any ancestor between checkout and output.
    while ($taskPath -ne $taskRootPath) {
        if (Test-Path -LiteralPath $taskPath) {
            if ((Get-Item -LiteralPath $taskPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Build output contains a link: $taskPath"
            }
        }
        $taskPath = Split-Path -Parent $taskPath
    }
}

function Get-DesktopOwnedOutputs {
    param([string]$Root)
    $taskDist = Join-Path $Root 'dist'
    if (!(Test-Path -LiteralPath $taskDist -PathType Container)) { return }
    Assert-DesktopOutputPath -Root $Root -Path $taskDist
    foreach ($taskDirectory in Get-ChildItem -LiteralPath $taskDist -Directory -Force) {
        try {
            $taskOrder = Get-DesktopOutputVersion -Label $taskDirectory.Name
            if (!$taskOrder) { continue }
            Assert-DesktopOutputPath -Root $Root -Path $taskDirectory.FullName
            $taskMarkerPath = Join-Path $taskDirectory.FullName '.desktop-build-output.json'
            if (!(Test-Path -LiteralPath $taskMarkerPath -PathType Leaf)) { continue }
            Assert-DesktopOutputPath -Root $Root -Path $taskMarkerPath
            $taskMarker = Get-Content -LiteralPath $taskMarkerPath -Raw | ConvertFrom-Json
            if ($taskMarker.schema -ne 1 -or $taskMarker.kind -cne 'git-desktop-default-output' -or $taskMarker.checkout -ne [IO.Path]::GetFullPath($Root) -or $taskMarker.version -cne $taskDirectory.Name) { continue }
            $taskExecutable = Join-Path $taskDirectory.FullName 'GitDesktop-win32-x64\GitDesktop.exe'
            $taskInfoPath = Join-Path (Split-Path -Parent $taskExecutable) 'build-info.json'
            Assert-DesktopOutputPath -Root $Root -Path $taskInfoPath
            Assert-DesktopOutputPath -Root $Root -Path $taskExecutable
            $taskInfo = Get-Content -LiteralPath $taskInfoPath -Raw | ConvertFrom-Json
            if ($taskInfo.schema -ne 1 -or $taskInfo.version -cne $taskDirectory.Name -or !(Test-Path -LiteralPath $taskExecutable -PathType Leaf)) { continue }
            [pscustomobject]@{ Path = $taskDirectory.FullName; Executable = $taskExecutable; Version = $taskOrder; BuiltAt = [datetime]$taskInfo.builtAt }
        } catch {
            Write-Warning "Preserving unverified build output $($taskDirectory.FullName): $($_.Exception.Message)"
        }
    }
}

function Get-DesktopLatestExecutable {
    param([string]$Root)
    $taskLatest = Get-DesktopOwnedOutputs -Root $Root | Sort-Object Version, BuiltAt -Descending | Select-Object -First 1
    if ($taskLatest) { return $taskLatest.Executable }
    return Join-Path $Root 'dist\GitDesktop-win32-x64\GitDesktop.exe'
}

function Clear-DesktopBuildOutputOwnership {
    param([string]$Root, [string]$Output)
    $taskMarkerPath = Join-Path $Output '.desktop-build-output.json'
    if (!(Test-Path -LiteralPath $taskMarkerPath -PathType Leaf)) { return }
    Assert-DesktopOutputPath -Root $Root -Path $taskMarkerPath
    $taskMarker = Get-Content -LiteralPath $taskMarkerPath -Raw | ConvertFrom-Json
    if ($taskMarker.schema -eq 1 -and $taskMarker.kind -ceq 'git-desktop-default-output' -and $taskMarker.checkout -eq [IO.Path]::GetFullPath($Root)) {
        # Rebuilds revoke old completion; only successful default builds re-enroll.
        Remove-Item -LiteralPath $taskMarkerPath -ErrorAction Stop
    }
}

function Assert-DesktopOutputTreeNoLinks {
    param([string]$Path)
    $taskPending = New-Object 'Collections.Generic.Stack[string]'
    $taskPending.Push($Path)
    while ($taskPending.Count -gt 0) {
        foreach ($taskItem in Get-ChildItem -LiteralPath $taskPending.Pop() -Force -ErrorAction Stop) {
            if ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Output contains linked contents.' }
            if ($taskItem.PSIsContainer) { $taskPending.Push($taskItem.FullName) }
        }
    }
}

function Complete-DesktopBuildOutput {
    param([string]$Root, [string]$Output, [string]$Label)
    # Call only for automatic outputs, after Complete-DesktopBuildVersion succeeds.
    try {
        $taskDist = [IO.Path]::GetFullPath((Join-Path $Root 'dist'))
        $taskOutput = [IO.Path]::GetFullPath($Output)
        if ((Split-Path -Parent $taskOutput) -ne $taskDist -or (Split-Path -Leaf $taskOutput) -cne $Label) { throw 'Unexpected automatic output path.' }
        $taskCurrentVersion = Get-DesktopOutputVersion -Label $Label
        if (!$taskCurrentVersion) { throw 'Invalid automatic output version.' }
        Assert-DesktopOutputPath -Root $Root -Path $taskOutput
        $taskMarkerPath = Join-Path $taskOutput '.desktop-build-output.json'
        Assert-DesktopOutputPath -Root $Root -Path $taskMarkerPath
        @{ schema = 1; kind = 'git-desktop-default-output'; checkout = [IO.Path]::GetFullPath($Root); version = $Label } | ConvertTo-Json | Set-Content -LiteralPath $taskMarkerPath -Encoding UTF8
        foreach ($taskOld in Get-DesktopOwnedOutputs -Root $Root) {
            if ($taskOld.Path -eq $taskOutput -or $taskOld.Version -ge $taskCurrentVersion) { continue }
            try {
                # Recheck the absolute deletion target; never traverse linked contents.
                Assert-DesktopOutputPath -Root $taskDist -Path $taskOld.Path
                Assert-DesktopOutputTreeNoLinks -Path $taskOld.Path
                Remove-Item -LiteralPath $taskOld.Path -Recurse -Force -ErrorAction Stop
                Write-Host "Removed older build output: $($taskOld.Path)"
            } catch {
                Write-Warning "Could not remove older build output $($taskOld.Path); the new build is ready. $($_.Exception.Message)"
            }
        }
    } catch {
        Write-Warning "Build output housekeeping was skipped; the new build is ready. $($_.Exception.Message)"
    }
}
