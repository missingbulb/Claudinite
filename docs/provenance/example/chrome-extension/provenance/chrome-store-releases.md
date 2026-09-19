---
covers:
  - skill: chrome-store-releases
status: live
---

## 2026-07-06 · born · the release standard: a guide plus five workflow templates (#126)
- **Source:** GoogleCalendarEventCreator's proven release set, generalized.
- **Reason:** every extension repo ships the same pipeline — versioning, the stable zip, release on a bump merge, the store upload with the four `CHROME_*` secrets, the daily auto-release, the privacy page, failure tracking issues — so it is authored once and copied verbatim modulo marked substitution points, not re-derived per repo.
- **Actor:** owner.
- **Model:** unrecovered.
- **Mechanism:** a standard document plus templates; packs did not exist yet.
- **Rejected:** unrecovered.
- **Retire when:** the Chrome Web Store upload API or GitHub's resolution of reusable workflows changes the contract.
- **Evidence:** #126 (Refs #125).

## 2026-07-07 · moved · becomes `RELEASE.md` of the opt-in pack `chrome-extension-release` (#155)
- **Reason:** the per-repo `releasing.md` and the `STORE-LISTING.md` submission kit are dropped as drift-prone duplicates of dashboard state; first publication becomes a one-time tracking issue.
- **Actor:** owner.
- **Evidence:** #155 (Refs #153).

## 2026-07-13 · reworded · the pipeline vendors into each consumer's own `.github/` (#280)
- **Reason:** GitHub only resolves a reusable workflow or composite action from a repo's own `.github/`, so the pack holds the templates and each repo hosts a managed copy, materialized by the `chrome-release-vendoring` migration; the create-package reusable is renamed so it does not collide with the orchestrator's filename.
- **Actor:** owner.
- **Evidence:** #280.

## 2026-08-19 · moved · `RELEASE.md` becomes this skill (#1060)
- **Reason:** the standard is long, and only the checks need to be eager; the same reason the static-site standard became a skill (#1056).
- **Actor:** owner.
- **Evidence:** #1060 (Refs #1057).

## 2026-09-03 · trigger-changed · forced for `.github/release.config` and the vendored `chrome-extension-*` workflows (#1650)
- **Reason:** the PreToolUse guard holds an edit there until the skill is loaded, so the contract is in context before the pipeline is touched.
- **Actor:** owner.
- **Evidence:** #1650 (Refs #1648); VERSIONS.md 60903.5.

## 2026-09-03 · reworded · opens on what to do, not on what the skill is (#1647)
- **Actor:** owner.
- **Evidence:** #1647; VERSIONS.md 60903.1.
