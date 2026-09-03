# macOS

## Assume the user's Mac has no developer toolchain

- **Diagnostics belong inside the shipped app**, or in a script using only what ships with macOS.
  Anything requiring a compiler on the user's machine is a diagnostic that will never be run.
- **`command -v swift` does not test for a Swift toolchain.** `/usr/bin/swift` exists on every Mac
  as a stub that pops the *"install the command line developer tools?"* dialog when invoked — so
  the probe passes and the script asks the user to install several gigabytes of Xcode. Gate on
  `xcode-select -p >/dev/null 2>&1`, which fails quietly when the tools are absent.
