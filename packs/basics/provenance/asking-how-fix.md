## 2026-09-21 · born · owner's free-text answers named the restructure the options never offered (#807)
- **Source:** conversation-logs captures `pr-788` and `pr-805` (growth-extract window: substantive
  commits 0341e10, 79ec340, d6e2f56, 52ffdc3, 9245309, 51c58c3, eec1b45, a5e5e0f, 2c9e5b6, 991af3f).
- **Reason:** in `pr-788` (folding `ui-requirements` into `ci.yml`) the owner opened with "This
  tests run shouldn't have happened on that commit. The scope should be narrower" — a structural
  complaint about having two workflows at all. The agent's `AskUserQuestion` offered only
  mechanism-level narrowing options on the existing separate workflow; none was "merge the
  workflows." The owner ignored the choices and answered in free text instead: "Why do we have an
  independant workflow for ui-requirements, and not have just one CI...?" — the deeper fix, which
  is what the PR's own title shows eventually shipped, after a ~15h round-trip mostly spent waiting
  for the owner to notice the question didn't fit. In `pr-805` (planJerusalem preference panels) an
  `AskUserQuestion` about the "Food" preference offered scoped UI-behavior options; after ~1h15m the
  owner's actual answer described a materially larger feature (named-place recommendations matched
  on several signals) matching none of the offered options. Same shape twice independently in one
  window: options scoped to *how* to implement, the owner answering at the scope of *what the thing
  should be*.
- **Mechanism:** `RULES.md` prose — the failure is a bias in how the agent composes
  `AskUserQuestion` options, not a statically checkable condition, so it stays a passively-read rule
  rather than a forced skill or a declared check.
- **Retire when:** a stretch of `AskUserQuestion` transcripts on structural complaints shows the
  restructure option being offered and either chosen or explicitly declined, rather than the owner
  routinely overriding via free text.

## 2026-09-24 · reworded · trimmed to trigger and action
- **Reason:** the owner asked to trim rule prose to zero story ("Trim to zero, unless crucial to
  understand severity"); the incident history lives on this file.
- **Actor:** the owner.

## 2026-09-25 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
