---
covers:
  - task: store-release
status: live
---

## 2026-07-22 · born · the task absorbs the release workflow's own 00:30 cron (#396)
- **Source:** the per-project scheduling design: one scheduler per repo, and the release workflow's independent cron was a second one.
- **Reason:** the task fires the daily release leg; the workflow keeps only its push and manual triggers, so the Claudinite scheduler stays the repo's only cron.
- **Actor:** owner.
- **Model:** unrecovered.
- **Mechanism:** an agentless task (`model: 'none'`), code-work only: the whole decision is code, and the worker is a quick REST dispatch.
- **Rejected:** keeping the workflow's own schedule beside the scheduler.
- **Retire when:** the scheduler stops being the repo's single cron, or the daily leg moves back into the workflow.
- **Evidence:** #396.

## 2026-09-02 · policy-changed · preconditions become `manifest-ahead || substantive-change`; shipping leaves the trigger (#1583)
- **Reason:** the unreleased-bump comparison becomes a task-local term in `preconditions.mjs` beside the declaration. Whether a repo ships the Chrome Web Store pipeline is a fact adoption settled, not a question worth re-asking nightly, so a repo that only codes an extension names `chrome-extension/store-release` in its `taskScheduler.disabledTasks`.
- **Actor:** owner.
- **Rejected:** re-deriving ship-path precision here — the daily workflow does the authoritative shipped-file diff against the latest release tag, so this is the cheap pre-filter and the workflow the exact gate.
- **Evidence:** #1583 (Refs #1578); VERSIONS.md 60902.1.

## 2026-09-03 · moved · the declaration becomes `task.json`; its comments become the task README (#1636)
- **Actor:** owner.
- **Evidence:** #1636; VERSIONS.md 60902.2.

## 2026-09-05 · policy-changed · `expected_outcome` `none` becomes `no_code_changes` (#1707)
- **Reason:** the four-value vocabulary carries the target policy beside the outcome; the same behaviour under the word that sits beside `amend_existing_or_create_new_pr` and `supersede_existing_pr`.
- **Actor:** owner.
- **Evidence:** #1707 (Refs #1695); VERSIONS.md 60905.1.

## 2026-09-06 · policy-changed · `due:daily` joins the preconditions (#1733)
- **Reason:** scheduling is the task's own precondition; the scheduler keeps no state.
- **Actor:** owner.
- **Evidence:** #1733.
