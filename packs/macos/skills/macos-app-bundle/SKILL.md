---
name: macos-app-bundle
description: Assembling a macOS .app bundle from a SwiftPM build — the bundle script, the generated .icns, LSUIElement for a menu-bar app, LSMinimumSystemVersion against the package's platform floor. Use when editing Info.plist, Package.swift or the bundle-assembly script.
metadata:
  force-load-on-file-edits-paths:
    - "**/Info.plist"
    - "**/Package.swift"
---

# The app bundle is assembled, not built

- **SwiftPM builds a binary; nothing builds you a `.app`.** `swift build -c release` yields an
  executable — the bundle (`Contents/MacOS/<exe>`, `Contents/Info.plist`,
  `Contents/Resources/`) is assembled by your own script. Keep that script the single place the
  bundle's shape is defined, so the local build and CI produce byte-identical layouts.

- **Commit one high-resolution icon master and generate the `.icns`** in the build script (`sips`
  to each size into an `.iconset`, then `iconutil -c icns`). Both tools ship with macOS, so the
  repo carries one PNG instead of ten, and the icon can't half-update.

- **A menu-bar-only app is `LSUIElement: true`** in `Info.plist` — that, not code, is what removes
  the Dock icon and the main window.

- **Pin `LSMinimumSystemVersion` to the same OS version the package's `platforms:` declares.** They
  are two independent claims about the same floor, and only one of them is enforced at launch.
