## 2026-07-06 · born · the release standard: a guide plus five workflow templates (#126)
- **Source:** GoogleCalendarEventCreator's proven release set, generalized.
- **Reason:** every extension repo ships the same pipeline - versioning, the stable zip, release on a bump merge, the store upload with the four `CHROME_*` secrets, the daily auto-release, the privacy page, failure tracking issues - so it is authored once and copied verbatim modulo marked substitution points, not re-derived per repo.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a standard document plus templates; packs did not exist yet.
- **Retire when:** the Chrome Web Store upload API or GitHub's resolution of reusable workflows changes the contract.
- **Landed:** #126 (Refs #125), the pre-pack corpus.

## 2026-07-07 · moved · becomes `RELEASE.md` of the opt-in pack `chrome-extension-release` (#155)
- **Reason:** the per-repo `releasing.md` and the `STORE-LISTING.md` submission kit are dropped as drift-prone duplicates of dashboard state; first publication becomes a one-time tracking issue.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a pack document read by the seven `cer/` checks' doc pointers, in a pack a repo declares only when it ships.
- **Landed:** #155 (Refs #153) · pack version 1.

## 2026-07-13 · reworded · the pipeline vendors into each consumer's own `.github/` (#280)
- **Reason:** GitHub only resolves a reusable workflow or composite action from a repo's own `.github/`, so the pack holds the templates and each repo hosts a managed copy, materialized by the `chrome-release-vendoring` migration; the create-package reusable is renamed so it does not collide with the orchestrator's filename.
- **Actor:** @missingbulb (owner).
- **Landed:** #280 · pack version 1.

## 2026-08-19 · moved · `RELEASE.md` becomes this skill (#1060)
- **Reason:** the standard is long, and only the checks need to be eager; the same reason the static-site standard became a skill (#1056).
- **Actor:** @missingbulb (owner).
- **Mechanism:** a skill, mounted by name and loaded on its description - reached when a pipeline is set up or debugged, when "bump version" is asked, or when a `cer/` check fires - rather than prose every session pays for. No path trigger existed yet.
- **Rejected:** keeping it as pack prose (four thousand words in every session of a repo that ships).
- **Landed:** #1060 (Refs #1057) · pack version 3.

## 2026-09-03 · trigger-changed · forced for `.github/release.config` and the vendored `chrome-extension-*` workflows (#1650)
- **Source:** path-scoped skills (#1648): loading a skill was model discretion, and the only enforcement was a post-hoc finding that fired after the agent had already gone in the direction the skill would have prevented.
- **Reason:** an edit of the pipeline's own files must not start without the contract in context.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `force-load-on-file-edits-paths: .github/release.config, .github/workflows/chrome-extension-*.yml` - exactly the files the standard governs and the checks judge, and nothing else: the manifest is not listed because a version bump is an ordinary change the `cer/version-bumped` check already judges, and the extension's source is not listed because the standard says nothing about it. The PreToolUse guard denies an `Edit`/`Write` there until the skill is loaded; the `skill-loaded-before-editing` check backstops edits made through Bash. The description keeps the activity moments the guard cannot see - setting a repo up, debugging the pipeline, "bump version", a firing `cer/` check.
- **Rejected:** the harness's own `paths:` frontmatter, which limits when a skill is offered at all rather than forcing a load.
- **Retire when:** the harness forces a skill load itself on a declared path.
- **Landed:** #1650 (Refs #1648) · pack version 60903.5.

## 2026-09-03 · reworded · opens on what to do, not on what the skill is (#1647)
- **Actor:** @missingbulb (owner).
- **Landed:** #1647 · pack version 60903.1.

## 2026-09-22 · trigger-changed · the description was carrying the body's summary, and every session paid for it
- **Reason:** past 60 words the description had stopped being what decides whether to reach for the
  skill and become a precis of the method, which the body already carries and which loads only when
  the skill does.
- **Mechanism:** the trigger half is kept whole — the moments, in the words somebody would use at
  those moments — and the summary half dropped; no force-load path changed, so what the harness
  loads deterministically is untouched and only the model's judgment call reads different text.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
