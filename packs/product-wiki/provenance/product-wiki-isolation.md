## 2026-07-17 · born · Add product-wiki pack: the self-growing product research wiki standard (#301)
- **Source:** the standard missingbulb/GoogleCalendarEventCreator had just adopted (its #678) - the
  LLM-wiki pattern Karpathy described: compile findings once, refine in place, cite everything, keep
  a dated growth log.
- **Reason:** the wikis are agent-rewritten, loosely-sourced research, so code, tests and docs that
  silently depend on them inherit unreviewed churn; the reviewed sink is the one crossing point.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a fixed barrier from the repo root to the wiki tree - fail-closed on an empty
  expansion, so a renamed or added wiki folder is barred with nothing to drift, and with
  unique-filename matching off so agent-written wiki filenames never become repo-wide barred bare
  names. Its findings carry a crossing remedy of their own, since a consumer cannot add a per-rule
  exception to a pack-shipped barrier.
- **Landed:** #301 (Refs #302) · pack version 1.

## 2026-07-19 · moved · Pack independence: no cross-pack code imports - compose by declaration + contributed config (#348)
- **Reason:** a pack may not import another pack's code, so the edge becomes pure data this pack
  contributes from its manifest and the barriers pack builds into the rule - composition by
  declaration and configuration rather than by import.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** manifest data under `contributes`, beside a declared requirement on the barriers
  pack, in place of a call into that pack's engine.
- **Landed:** #348.

## 2026-08-15 · converted · Declarative checks: review document + the implementation it recommends (#839)
- **Reason:** barriers gain the declarative checks language on the shared scanning engine, so a
  fixed barrier stops being a manifest contribution and becomes an ordinary declaration in the pack
  that owns it. Findings stayed byte-identical on this repo but for the doc field declared checks
  deliberately drop.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a forbidReferences entry in the pack's declared-checks.json, its gate directory
  becoming a path-exists relevance condition.
- **Landed:** #839 (Refs #838).

## 2026-09-22 · policy-changed · one settings-file name, now the rename's window has passed (#1919)
- **Reason:** `.claudinite-checks.json` was read everywhere beside `.claudinite-settings.json` while
  members converged onto the new name, and every reader that asked "is this the declaration" carried
  its own copy of the two-name loop. The convergence window `legacy-shape-in-use` opened has passed,
  so each of those readers now names one file. A member still carrying the retired name reads as
  having no declaration at all - the stated cost of the retirement, and why its policy is nothing.
- **Mechanism:** the reader takes `SETTINGS_FILE` rather than iterating `SETTINGS_FILES`, which is
  now a one-element list kept only as a link-time shim for fielded pack versions (#1911).
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1919
