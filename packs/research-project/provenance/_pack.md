## 2026-07-04 · born · Project-type templates catalog + categorize-at-bootstrap flow (#116)
- **Source:** the gRatio project's `docs/research_process_playbook.md`, lifted verbatim as the first
  entry in a project-type templates catalog and scrubbed of the one project-specific path it
  hardcoded.
- **Reason:** the owner runs one class of project repeatedly - an algorithm over similarly-formatted
  inputs, scored against annotated ground truth, improved in reviewable iterations - and the working
  procedure for it existed only inside one project. A catalog of one playbook per class gave the
  class a home a fresh project is matched against at bootstrap.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a project-agnostic template under `templates/`, linked from a matching project's
  own CLAUDE.md at bootstrap and left the single source of truth for the class; packs, checks and
  skills did not exist yet.
- **Rejected:** copying the playbook into each project, which is what the lift replaced: the catalog
  entry is linked, so the class has one text rather than a copy per repository.
- **Landed:** #116 (Closes #115).

## 2026-07-06 · moved · becomes the pack `research-project` (#128)
- **Reason:** the context-relief architecture replaced always-loaded corpus files with two homes
  selected by when a rule is active, and `templates/` was folded into `packs/` with `always/`,
  `tasks/` and `technologies/`. The playbook crossed unchanged: `packs/research-project/RULES.md` at
  this commit is byte-identical to the template it replaced.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, declared and never fingerprinted - what a repository holds says
  nothing about whether the work in it is this class of research, so a project declares the pack the
  way it used to link the template. All fourteen sections stay prose: methodology and judgment, with
  no static signature a check could read.
- **Rejected:** splitting the class along the seams the manifest header names, session continuity
  and reading source articles, which stay noted as future splits rather than packs of their own.
- **Landed:** #128 (Closes #127, Closes #131) · pack version 1.

## 2026-07-29 · policy-changed · Pack manifest as the single source: routing guidance, skills, scoped rules (#555)
- **Reason:** nothing in the corpus said where a piece of content belongs, so a rule that could
  plausibly live in more than one pack defaulted into the baseline. This pack's boundary is drawn
  against the two neighbours its subject is confused with: shipping an end-user product against a
  spec, and market research.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** `ruleRoutingGuidance` on the manifest - `belongs` naming the scoring, phases and
  session continuity of iterating an algorithm against annotated ground truth, `excludes` pointing
  product-against-a-spec at spec-driven-product and market research at product-wiki. The set renders
  as a routing table at session start, so each side is capped at twenty words.
- **Landed:** #555 · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with three paragraphs of playbook framing - what the class is, and
  that it is a default to adapt rather than a contract - plus section preambles leading into rules
  they added nothing to. None of it changes what a session does, every session in every declaring
  repo paid for it, and the README and the manifest's `ruleRoutingGuidance` already carried it. The
  paragraph-form instruction inside the numbered sections was left alone: it instructs, and
  rewriting it is a rewrite of substance rather than this sweep.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.
