## 2026-09-21 · born · the file starts here; the pack's earlier history is not backfilled yet
- **Reason:** this file was empty when the change below was made, and the clone it was made from
  carries too little history to derive the pack's origin. The backfill that fills it is its own pull
  request and replaces this entry with the derived history.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the pack's manifest, which carries its adoption question and the address of the
  store.

## 2026-09-21 · policy-changed · a person brings a pack, not a preferences file (#2188)
- **Reason:** the store held one `<email>.md` per person, so the only thing a person could carry was
  prose. What people wanted to carry - a skill they reach for, a check for the mistake they keep
  making, a toolchain their own tools need - already has a carrier with an engine behind it, and
  pouring a pack gets all of them at once where the alternative was a second delivery path per
  capability.
- **Actor:** @missingbulb (owner), who set the shape: one pack per person, poured into a fixed
  folder the generated rules index already imports.
- **Mechanism:** `<path>/<email>/` in the store is an ordinary pack directory; `session-prepare.mjs`
  pours it into `.claudinite/temp/packs/current_user/`, the engine's session pack root, and the
  loader that reads the canon and the repo's own packs picks it up. The prose then reaches the
  session on the memory channel rather than hook stdout, which #807 measured being truncated.
- **Rejected:** listing the person's directory through the GitHub tree API, which 403s behind the
  sandbox proxy, and a codeload tarball, which this repo's own guard records as commonly denied
  where git against the same repository is not. A shallow blob-filtered sparse clone is what reaches
  a private store at all.
- **Landed:** #2188

## 2026-09-21 · policy-changed · the metaphor went, and the single-file store with it (#2189)
- **Reason:** the owner read the module's own summary back and named what it should have been
  called: it copies a directory into a repo. "Pour" was a metaphor doing no work, and a file called
  `store.mjs` said where something lived without saying what lived there. The legacy single-file
  tolerance went at the same ask: converting the one store that exists is cheaper than carrying a
  second address forever, and a window where an unconverged member loads nobody's rules is
  acceptable.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `pour.mjs` is `copy_user_pack_to_repo.mjs` and `store.mjs` is
  `user_pack_address.mjs`, each named for what it does rather than for the shape it sits in. The
  store's own conversion is missingbulb/Shepherd#698.
- **Landed:** #2189
