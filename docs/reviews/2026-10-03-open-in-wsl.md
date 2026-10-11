# Open in WSL directory diagnosis

Verified on 2026-10-03.

The running GitDesktop processes use `D:\code\git-desktop\dist\GitDesktop-win32-x64\GitDesktop.exe`. Its renderer bundle, built on October 1, contains the current launcher selecting Debian-WSL1 and passing the selected checkout with `--cd`. Worktree context-menu folder actions receive the worktree path.

Reproduction: WSL started with `--cd D:\code\git-desktop`; a non-login Bash printed `/mnt/d/code/git-desktop`, while an interactive login Bash printed `/mnt/d/code`. `/home/renxo/.profile` contained an unconditional `cd /mnt/d/code` on line 32.

Corrected the profile to use that default only when `$PWD` equals `$HOME`, preserving explicitly selected directories. Backup: `/home/renxo/.profile.before-open-in-wsl-20261003-161911`.

Also corrected `launch-github-desktop.cmd` to launch the current GitDesktop package. Previously it preferred an older GitHubDesktop package from September 30, whose renderer lacks the current WSL launcher.

Validation: interactive login shells preserve `/mnt/d/code/git-desktop` and `/mnt/d/code`; startup from the home directory still defaults to `/mnt/d/code`. The profile passes `bash -n`. Actual GUI context-menu clicking was not exercised; the startup behavior was reproduced and verified directly through WSL. Existing unrelated source changes were preserved.
