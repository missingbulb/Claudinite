---
name: macos-signing-and-release
description: The Developer ID signing, notarization, stapling and drag-install DMG lane for a direct-download macOS app, and the Gatekeeper story owed to users. Use when signing or distributing a build, or writing the release workflow or install doc.
---

# Keep signing and notarization an optional, secret-gated lane

- **The unsigned path must stay a working path.** Gate the Developer ID + notarization steps on the
  signing secrets being present, and ship an **ad-hoc-signed** artifact when they aren't. Make
  signing a required step and every fork, and every build in a repo whose secrets aren't set, goes
  red for a reason unrelated to the change.

- **An ad-hoc signature cannot be notarized.** They are separate lanes, not degrees of the same
  one: only an identity-signed bundle can be submitted to the notary service. Don't write a
  pipeline that "tries" to notarize whatever it just signed.

- **Notarize the distributed container, then staple it** (`notarytool submit --wait`, then `stapler
  staple` and `stapler validate`). Stapling is what makes the download open offline without a
  round-trip to Apple; skipping it works on your machine and fails on a user's.

- **In CI, an imported identity must be in the searchable keychain list.** Creating an ephemeral
  keychain, importing the `.p12` and setting the key partition list is not enough —
  `codesign` searches the *user's keychain list*, so the new keychain has to be added to it or the
  identity is simply not found.

- **Say out loud, in a build annotation, which lane ran.** "No signing secret — publishing an
  ad-hoc build" turns a silently-degraded artifact into a visible one.

# Distribution and the Gatekeeper story you owe the user

- **A drag-to-install DMG is a staged folder, not Finder scripting.** Stage the `.app` beside a
  symlink to `/Applications`, drop the icon in as `.VolumeIcon.icns`, flag the folder as having a
  custom icon, and let `hdiutil create` carry it through. Anything that automates Finder to lay out
  the window is fragile in CI and unnecessary.

- **Write the Gatekeeper bypass for the OS your users are on.** macOS 15 removed the
  right-click → *Open* bypass; the current path is System Settings → Privacy & Security →
  *Open Anyway*, or `xattr -dr com.apple.quarantine <app>`. An install doc that still says
  right-click → Open reads as broken software.
