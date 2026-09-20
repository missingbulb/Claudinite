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
