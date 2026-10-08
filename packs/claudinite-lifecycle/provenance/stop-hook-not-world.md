## 2026-09-22 · born · a clean world sweep was read as a quiet Stop hook (#2032)
- **Source:** Shepherd and EdFringeNow runs that declared `check_the_world.mjs` clean and were then
  blocked at Stop by findings that runner never looks at.
- **Reason:** the two runners are not one rule set on two triggers - they share no code and cover
  disjoint scopes. `check_the_world` sees only `scope !== 'work'` rules and is what CI runs; the
  Stop hook runs `check_the_work`'s `scope: 'work'` rules over the diff and the transcript. So a
  green world sweep carries no information about whether Stop will block, and reading it as
  reassurance costs the cycle it was meant to save.
- **Mechanism:** prose in this pack's RULES.md, keyed to the act of verifying before a commit rather
  than to the state, since that is the moment the wrong runner gets chosen.
- **Rejected:** #1886 promoted the same lesson from a different member, keyed to the misconception
  ("a green sweep is not evidence"). This pack's own `keying-rule-trigger` prefers the act, so that
  wording was dropped and this one kept; one lesson, one rule.
- **Retire when:** the two runners share a scope, or one reports the other's pending findings.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and deduplicated in an owner
  session.
- **Model:** claude-opus-5
- **Landed:** #2032

## 2026-09-26 · reworded · the CI clause was false; CI runs both sweeps (#2341)
- **Source:** #2326 read the rule, concluded a `scope: 'work'` gate does not run in CI, and landed a
  provenance entry the gate forbids; CI then blocked on `improve-comments-scope` and the recovery
  cost the owner 685s answering a question the rule had created.
- **Reason:** this repo's `ci.yml` runs the work-scope sweep beside the world sweep, and this pack's
  own `conformance-work-scope` advises every member to; the clause claimed the opposite. Dropped
  rather than replaced with a corrected version - the rule's subject is predicting Stop, and which
  trigger runs which sweep is the repo's own wiring, which its `ci.yml` answers.
- **Actor:** claudinite-tasks implement-request run on marked issue #2341.
- **Model:** claude-opus-5
- **Landed:** #2341
