# Git Desktop artwork

`git-mark.svg` is the official orange Git logomark downloaded from
https://git-scm.com/images/logos/downloads/Git-Icon-1788C.svg.
Git logo by Jason Long, licensed under Creative Commons Attribution 3.0:
https://creativecommons.org/licenses/by/3.0/.

Run `node script/generate-branding.mjs` with Playwright Chromium installed to
regenerate the SVG, Windows ICO, macOS ICNS, and Linux/About PNG assets.
Production uses the original mark; development adds a DEV badge. The generator
also updates Icon Composer sources. Compile the macOS asset catalogs on a Mac
with `script/build-icon-assets.sh` before shipping macOS builds.

Convert `win32-installer-splash.png` to `win32-installer-splash.gif` with Pillow
after regeneration (`Image.open(source).convert('RGB').save(destination)`).
The Windows installer splash is a static GIF of the Git Desktop mark. Application
IDs, profile paths, credential keys, and authentication protocols are independent
of these visual assets.
