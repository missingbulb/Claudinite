## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the rule's failure mode is a build that breaks, so it is blocking, and the signature
  is static: `BuildMethod: esbuild` in a tracked template with esbuild in `devDependencies` only.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check aws-sam/esbuild-dependency, blocking, a coded rule with its own `run(ctx)`.
  Scoped to single-package repos: with more than one `package.json` the SAM function may build from
  a different manifest and a root `devDependency` esbuild for other tooling is legitimate, so the
  check skips rather than misfire.
- **Rejected:** firing on any repo carrying a SAM template - the adversarial pass showed the
  multi-package case as a false positive.
- **Landed:** #128 (Closes #127, Closes #131) · pack version 1.

## 2026-08-14 · moved · Pattern-check engine: structured-data (parsed JSON/YAML) assertions (#820)
- **Reason:** a check whose subject is a parsed document's fields is data, not code; the declaration
  states it with ids, severities and message strings preserved verbatim.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the hand-written `run(ctx)` becomes relevance gates plus a `checkParsedFile`
  declaration over `package.json`.
- **Landed:** #820 (Closes #819) · pack version 2.

## 2026-08-14 · moved · Declared checks are JSON, one file per pack (#827)
- **Reason:** a declaration is a table row, not a module. JSON cannot hold a comment, so the
  no-comments-on-a-check rule is enforced by construction, and a declared check states its own case
  rather than deferring to a `doc` pointer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the declaration moves into `packs/aws-sam/declared-checks.json`, discovered
  structurally by the pack registry - no import and no manifest line, so writing the declaration
  adds the check.
- **Landed:** #827 (Closes #826) · pack version 2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
