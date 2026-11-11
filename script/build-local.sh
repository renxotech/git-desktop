#!/usr/bin/env bash
# Run the Windows build from WSL using the Windows toolchain.
set -euo pipefail

args=()
for arg in "$@"; do
  case "$arg" in
    --tests) args+=('-Tests') ;;
    --non-interactive) args+=('-NonInteractive') ;;
    --no-launch) args+=('-NoLaunch') ;;
    --launch-only) args+=('-LaunchOnly') ;;
    --allow-dirty) args+=('-AllowDirty') ;;
    --analyze-bundle) args+=('-AnalyzeBundle') ;;
    -h|--help)
      printf '%s\n' 'Usage: bash script/build-local.sh [--tests] [--non-interactive] [--no-launch] [--launch-only] [--allow-dirty] [--analyze-bundle]' \
        'Builds the Windows executable using Windows PowerShell, Node, and Electron.' \
        'Launches the app after packaging unless --no-launch is supplied.' \
        'Clean builds receive local vYYYY.MM.DD_NN tags; --allow-dirty creates an untagged preview.' \
        'Use --analyze-bundle to generate the optional renderer bundle report.' \
        'Tests run after the executable is ready when --tests is supplied.'
      exit 0
      ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

if ! command -v wslpath >/dev/null || ! command -v powershell.exe >/dev/null; then
  printf '%s\n' 'Run this script in WSL with Windows interoperability enabled.' >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
windows_script=$(wslpath -w "$script_dir/build-local.ps1")
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$windows_script" "${args[@]}"
