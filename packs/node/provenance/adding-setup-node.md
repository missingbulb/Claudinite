## 2026-09-14 · born · converted from references.md (RULES-3)
- **Reason:** setup-node's README: its v5 breaking changes "enabled caching by default with package
  manager detection if no cache input is provided", scoped to a `package.json` whose
  `packageManager` or `devEngines.packageManager` names npm, and its `cache-dependency-path` note
  that the key is a hash of the lockfile. The conditional form is
  `packs/chrome-extension/stubs/workflows/chrome-extension-create-package.yml`, live in members,
  whose own comment records that npm caching needs a lockfile. Filed under #2019.
- **Mechanism:** prose
- **Retire when:** Retire when setup-node caches without a lockfile or stops enabling itself.
