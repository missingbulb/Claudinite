---
name: bump-version
description: Raise the project's version — a minor bump by default. Use when the owner says "bump version".
---

The mechanics are the consuming project's — its release/workflow doc names which files carry
the version and how a release follows.

**Semantic versions (`X.Y.Z`).** For a Chrome-extension repo the standard applies
([the chrome-extension pack's chrome-store-releases skill](../../../../packs/chrome-extension/skills/chrome-store-releases/SKILL.md)):
the **patch** is not a bump to ask for — every change that touches a shipped file raises it in its
own PR, and `cer/version-bumped` is what requires it. "bump version" is the deliberate **minor**
(default) or **major**: dispatch the repo's **Release to Chrome Store** workflow with `mode: bump`
and the part, which edits the manifest and `package.json` together, pushes, and packages the result.
The same edit by hand on a branch is equivalent.

**Date-anchored versions (`<major>.<ymmdd>.<n>`).** A project on this scheme — a static site under
[the static-website pack's static-site-releases skill](../../../../packs/static-website/skills/static-site-releases/SKILL.md) —
computes the last two parts from the previous version and the UTC date, and a change that touches
the publish set does that in its own PR (`sw/version-bumped`). So there is no minor to raise and
nothing to compute by hand: **"bump version" means the `major`**, the deliberate "this is a new
generation of the site" statement. Dispatch the repo's **Release static site** workflow with
`bump: major`; it writes every version record together, pushes, and releases. Never hand-write the
`ymmdd` or the counter — a value dated in the future makes the next bump refuse.
