## 2026-06-25 · born · the corpus file `technologies/chrome-extension.md`, before packs existed
- **Source:** the corpus restructure into general/, preferences/ and technologies/ with soft routing by technology; the file was seeded over the following weeks from two members' local docs.
- **Reason:** MV3 gotchas true for any extension read cold needed one home a session could be routed to by technology.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a prose file; packs, checks and skills did not exist yet.
- **Landed:** commit a979d7eb, the pre-pack corpus; seeded by c90f0c51 and #108.

## 2026-07-06 · moved · becomes the pack `chrome-extension` (#128)
- **Reason:** the context-relief architecture: a pack is prose plus checks plus skills, fingerprinted so a repo self-declares it, and a `manifest.json` declaring `manifest_version` is what an extension repo has from its first commit.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a `detect` fingerprint on the manifest, never a hand declaration: the fact that decides whether the pack applies is structural, so the declaration would be a second copy of it.
- **Landed:** #128 (Refs #127) · pack version 1.

## 2026-07-07 · split · the release standard becomes its own opt-in pack, `chrome-extension-release` (#155)
- **Reason:** the coding gotchas apply whenever an extension is written; the release standard (the guide, seven `cer/` checks, the stubs) only when it ships, and declaring the coding pack forced four workflow stubs, a privacy page and README sections on a half-built extension.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** the release pack is opt-in, fingerprinted by the standard's "Release: *" workflow stubs and never by the manifest, so a manifest alone never arms the release checks; the check ids were already `cer/`. The workflows and composite actions ship as stubs materialized into each consumer's own `.github/`, because GitHub resolves a reusable workflow or a composite action only from the repo's own `.github/`; a cross-repo `@main` reference would not resolve at all.
- **Rejected:** one pack whose release half is gated on a second declaration.
- **Landed:** #155 (Refs #153, #156) · pack version 1.

## 2026-08-19 · merged · `chrome-extension-release` collapses back into this pack, gated on shipping (#1060)
- **Reason:** the release pack's `detect` was the orchestrator workflow's name, so the fact that decided whether the release rules applied was always structural, and the declaration was a second copy of it a repo had to remember to write.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the fact is read where it is used - `shipsReleasePipeline` gates the coded rule, every `cer/` declared check carries the same test as its `relevantWhen`, and the task's precondition asks the `release` signal. The gate is two signals, either one enough - the orchestrator's name, or a `.github/release.config` - because gating on the name alone lets a repo that renamed its orchestrator lose every release check including the one that says to rename it back, and gating on the config alone makes the check requiring that file unreachable.
- **Rejected:** two packs (a declaration duplicating a structural fact); renaming the `cer/` ids to match the merged pack (a member's `accept` entries name rules by id, and a rename silently orphans an acceptance; a prefix outliving its pack is the cheaper of the two).
- **Retire when:** members declare packs by something other than a literal id, so an absorbed pack's members are no longer silently dropped.
- **Landed:** #1060 (Refs #1057) · pack version 3; the rename-map entry in the pack loader.

## 2026-08-23 · reworded · the manifest stops restating its own tree (#1248)
- **Reason:** `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` resolve from the pack directory; an absent `detect`/`marker` means no fingerprint. A corpus-wide decision, cited here.
- **Actor:** @missingbulb (owner).
- **Landed:** #1248 · pack version 60822.1.

## 2026-09-02 · reworded · `RULES.md` drops the descriptive framing the README carries (#1634)
- **Reason:** every session in every declaring repo pays for a `RULES.md` line, and a description of the pack is not a rule. A corpus-wide decision, cited here.
- **Actor:** @missingbulb (owner).
- **Landed:** #1634 · pack version 60903.2.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-27 · scope-changed · the fingerprint is a `relevanceDetector` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `relevanceDetector` (engine/pack_loader/relevance-detector.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.

## 2026-09-28 · reworded · the fingerprint's patterns are written as source strings
- **Reason:** a manifest that is data cannot hold a RegExp; each pattern is its source string, or {
  source, flags } where it carries a flag, and loads to the same RegExp.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.

## 2026-09-28 · reworded · the manifest's comments leave it, their decisions recorded here
- **Reason:** a manifest that is data carries no comments. What they decided: the release half is
  gated on shipping rather than on a second declaration (#1057): shipsReleasePipeline gates the
  coded rule and every declared check carries the same relevantWhen, so a repo that only codes an
  extension sees none of them. The cer/ check ids outlived the retired chrome-extension-release
  pack, because a member's accept entries name rules by id and a rename orphans them. The release
  standard is skills rather than prose: it is long, and only the checks need to be eager.
- **Actor:** @missingbulb (owner), asking for pack.json manifests, their comments deleted or moved
  to a README or provenance.

## 2026-09-28 · moved · the manifest becomes pack.json
- **Reason:** a manifest that is data is read with no import and by any tool; the conversion wrote
  the module's evaluated export, and the pack loads identically.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
- **Mechanism:** pack.json, which the loader prefers over pack.mjs; a canon pack now needs engine
  60928.1, the first to read it.

## 2026-09-28 · scope-changed · the fingerprint is an MV3 manifest at the root or one directory down
- **Reason:** manifest_version alone fired on a Firefox-only MV2 extension and on a fixture
  extension anywhere in the tree; the pack is written for MV3, and every other marker stops one
  directory down.
- **Actor:** @missingbulb (owner), in review of #2382.
- **Mechanism:** paths over a near-root manifest.json, text over "manifest_version": 3.
- **Rejected:** dropping it, since an extension declares no package dependency a manifest-based
  fingerprint could read instead.
