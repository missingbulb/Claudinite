## 2026-08-08 · born · Personal preferences as a pack, and one general primitive: a pack's own session-start step (#567)
- **Source:** `preferences/<email>.md` sitting in the canon itself, with the session-start step
  falling back to a hardcoded raw URL into this repository.
- **Reason:** personal interaction preferences are the concern of one fleet's people, and the canon
  is mounted by every fleet that adopts Claudinite - which makes it both the wrong host for one
  group's preferences and the wrong authority on where they live. The pack is named for the SURFACE
  rather than for the feature: a Claude Code web session runs for a signed-in person in a managed
  container and a terminal session does neither, so the whole class of capability that has to know
  who is here belongs together behind one declaration a project makes once, and preferences are only
  its first member.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the pack manifest, seeded by default and carrying the adoption question that asks
  where the store is. The pack holds an ADDRESS and not the content, so its entry config names a
  repository and a path inside it. The engine runs the pack's session-start step because the file is
  there, through the structural pack-session-start runner this change added as the symmetric half of
  the session-end one, and learns nothing about what the step does - which is what lets this be a
  pack at all rather than a special case wired into every repo's session-start machinery.
- **Landed:** #567 · pack version 1.

## 2026-08-17 · reworded · Move the environment setup script into the web pack, and converge the clone's git config at session start (#956)
- **Reason:** pasting a body into an environment's Setup script field is a capability of the managed
  container a web session runs in, not engine machinery, so the script belongs on this pack's
  surface; the engine's part, aggregating the active packs' `env` declarations, stays where it is.
  The per-clone git config the script also carried went the other way, to the session-start
  orchestrator, because it ran once at image-build time and only where somebody had pasted the
  script - a terminal clone never had it and a re-cloned checkout lost it.
- **Actor:** @missingbulb (owner).
- **Landed:** #956 (Fixes #955) · pack version 2.

## 2026-09-13 · policy-changed · Load personal preferences only into attended sessions (#1992)
- **Reason:** a routine fired under a person's account carries their identity but not their
  presence, so a scheduled run was loading somebody's interaction preferences into a session they
  were not in.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the pack's session-start step reads the harness's attended flag; unset still loads,
  so a harness that does not set it behaves as before.
- **Landed:** #1992 (Closes #1991) · pack version 60913.1.

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

## 2026-09-22 · policy-changed · the person's pack is counted with every other pack, not beside them
- **Source:** the owner, reading the session line, said the personal pack now loads like the others
  and its tokens should be counted, so the separate "530 personal pack tokens" facet should go.
- **Reason:** the copy is on disk before the summary step runs, off the same registry the summary
  reads every other pack from, so the engine can weigh it and the step's claim to be the only thing
  that could had gone stale. Two numbers for prose that loads identically also meant a reader
  holding only the corpus figure was told a corpus smaller than the one they had.
- **Mechanism:** the step stops emitting its `CLAUDINITE-FACET:` line, and the engine's summary
  drops the filter that held a copied pack out of every count. What the step still owes a reader is
  why a person HAS no pack, which no count can say, so that half stands.
- **Retire when:** the copy stops landing before the summary step, or a person's pack stops reaching
  the window through the same import as the rest.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
