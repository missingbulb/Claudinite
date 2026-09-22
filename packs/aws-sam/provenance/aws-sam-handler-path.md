## 2026-07-06 · born · aws-sam: two YAML-based checks (handler-path, cloudfront-authorization) via a minimal YAML parser (#137)
- **Reason:** esbuild's default `outbase` is the entry point's own directory, so SAM's esbuild
  builder strips a single entry's subdirectory from the artifact and a subdirectory-carrying
  `Handler` fails only at first invoke with `Runtime.ImportModuleError` - `sam build` succeeds
  either way, so nothing before deploy catches it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check aws-sam/handler-path, blocking, navigating template structure through a
  minimal dependency-free YAML-subset parser rather than grepping text. It skips where `OutBase` is
  set or there is more than one entry point, the two false-positive cases the adversarial pass
  flagged.
- **Rejected:** a text-grep conversion - the first prose-to-checks pass (#131) rejected this gotcha
  as false-positive-prone because a grep cannot read template structure, and the parser is what made
  it convertible.
- **Retire when:** reaffirm against esbuild's outbase documentation and SAM's esbuild builder;
  retire only if either changes that default.
- **Landed:** #137 (Closes #136) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** the sweep cut from every rule in the corpus the consequence prose arguing for a rule
  rather than enabling it, leaving each as trigger, instruction, and at most one clause of why. This
  pack went from 984 words to 885.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466) · pack version 1.

## 2026-07-29 · merged · prose-to-checks: add the deletion test and sweep the canon with it (#552)
- **Reason:** the deletion test - with the paragraph gone, would the check still catch every
  violation it describes and tell the agent how to fix it? For this rule it would, so the RULES.md
  paragraph was deleted whole rather than trimmed and the check became the lesson's only carrier.
  The failure message owns the rule and the header comment owns the rationale, so a paragraph
  restating either pays twice.
- **Actor:** @missingbulb (owner).
- **Landed:** #552 (Closes #551) · pack version 1.

## 2026-08-14 · reaffirmed · Pattern-check engine: structured-data (parsed JSON/YAML) assertions (#820)
- **Reason:** kept as code deliberately while its two siblings became declarations - it is a derived
  comparison, the `Handler` prefix against the `EntryPoints` dirname with skip conditions, which the
  declaration vocabulary cannot express without expressions.
- **Actor:** @missingbulb (owner).
- **Landed:** #820 (Closes #819) · pack version 2.

## 2026-09-01 · reaffirmed · Align shared packs' rules and skills to the references convention (#1565)
- **Reason:** the check's premise is a documented esbuild default that could lapse, so its origin
  and the documentation it derives from were recorded for the revalidation pass to reaffirm against.
  A check guarding repo-internal structure gets no such record; this one guards platform behaviour.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #1565 (Closes #1564) · pack version 60901.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
