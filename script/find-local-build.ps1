$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-output.ps1')
Get-DesktopLatestExecutable -Root (Split-Path -Parent $PSScriptRoot)
