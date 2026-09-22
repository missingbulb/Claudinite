## 2026-09-22 · born · a green world sweep was read as a quiet Stop hook (#1886)
- **Source:** ClaudiniteWebsite, where a run declared the world runner clean and was then blocked at
  Stop by findings that runner never looks at.
- **Reason:** the two runners are not one rule set on two triggers - they cover disjoint scopes. The
  world runner sees only `scope !== 'work'` rules and is wired to CI; the Stop hook runs
  `check_the_work.mjs` over the diff and the transcript against `scope: 'work'` rules. So a green
  world sweep carries no information at all about whether Stop will block, and reading it as
  reassurance costs the cycle it was meant to save.
- **Mechanism:** prose in this pack's RULES.md, keyed to the moment a session is about to treat one
  runner's silence as the other's; no check can see a conclusion a session drew.
- **Retire when:** the two runners share a scope, or one reports the other's pending findings.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and resolved in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1886
