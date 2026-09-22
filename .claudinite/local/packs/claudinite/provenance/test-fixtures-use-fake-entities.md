## 2026-09-22 · born · a rename on the shelf was landing as an edit of unrelated tests
- **Source:** the owner, after the #1916 pack-id retirement: "you keep having to change unrelated
  tests when some file gets renamed or deleted".
- **Reason:** a test that needed "some declared pack" reached for `basics` and one that needed "some
  task" reached for `update`, so every absorption or retirement on the shelf arrived as a diff
  across the corpus that a reviewer had to read past to find the change. 1 277 such literals stood
  across 150 test files when the check was first executed.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** a blocking world rule rather than prose, because the condition is fully decidable
  from the tree: a name's owning pack is read off where the tree keeps it and compared with the
  test's own home. Three exemptions keep it from firing on what is not a fixture - an import
  specifier (a dependency, and moving a module already rewrites its importers), a `@real-entity`
  marker on the line (the subject case), and a one-word id standing alone as a whole literal (`node`
  is a program the suites spawn, `update` is what half the GitHub API calls its method).
- **Rejected:** a file-level opt-out, which would have let a mixed file readmit fixtures under the
  cover of its one genuine subject; and deriving every "any canon pack" id from `loadPacks()` at run
  time, which made each case depend on whichever pack happened to sort first and on properties it
  does not declare - `A_CANON_PACK` in the test helpers names it once instead.
- **Retire when:** the shelf stops moving, or the blocking firings come to be dominated by cases
  where the fixture was already fake.
- **Landed:** #2241

## 2026-09-22 · split · the general half went to the canon, the mechanics stayed here
- **Reason:** the principle - invent the name where the case holds for any name at all - holds in
  any repo, so it became `basics`' `fixture-names-invented` on the testing skill. What stays is what
  only this repo has: the `acme-*` vocabulary its check names, the `A_CANON_PACK` helper, and the
  `@real-entity` marker.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Landed:** #2241
