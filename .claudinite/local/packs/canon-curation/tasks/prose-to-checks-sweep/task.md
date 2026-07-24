# Prose-to-checks — sweep the corpus's existing prose

Mine the corpus's **existing** prose — pack `RULES.md`, skill `SKILL.md` — for always-testable rules that the conversion missed, and convert the strongest ones. Where [growth-promote](../growth-promote/task.md) descends the ladder for each *new* lesson, this task works the *backlog*: the standing prose that was always mechanizable but never converted, so the corpus keeps shedding context over time. A canon-local task — it reads and edits **this** repo's corpus only, no fleet reach.

You run under the executor, dispatched by a `ready-for-agent` issue. There is no windowed Context to bind — the backlog is the whole corpus; work a sensible slice of it this run.

The task's declared outcome ceiling is **`open-pr`**: convert prose to checks in a single owner-approved PR, never auto-merged.

## The method lives in the skill

The conversion method — how to spot an always-testable rule in prose, judge convertibility, author the check plus its **see-it-fail** fixture, and decide what stays prose — is owned by the [**prose-to-checks** skill](../../skills/prose-to-checks/SKILL.md). Follow it; don't re-derive it here. This worker only frames the unattended run around it.

## What a run does

1. **Pick convertible prose.** Read across the corpus's `RULES.md` / `SKILL.md` prose for rules that are *always testable* — a deterministic condition a check could assert — and that no existing check already covers. Prefer the strongest, clearest candidates; a run that converts one or two solid rules well beats a run that churns many shakily.
2. **Convert per the skill.** For each, author the rule module in its owning pack, register it, and add a **fixture test that fires on a violating input and stays quiet on a clean one** (see-it-fail is mandatory — a check that can't be made confident is left as prose, never shipped broken). Replace or tighten the now-redundant prose so the rule has one home.
3. **Open a PR against `main`.** One PR for the run's conversions, on a per-run-unique branch — never a direct push. **Put the issue reference in the commit message** (`Refs #<n>` for the tracker below) — the `basics` `task-lifecycle` check reds CI on a commit that cites none. Keep the offline test suite green before opening.
4. **Log to the tracker.** The standing log is the issue titled exactly **`Claudinite tracker: Prose to Checks`** on the canon. Find it **by that exact title, never a fuzzy match or a hard-coded number**; create it already closed if missing. **Never open, close, or reopen it** — its state carries no meaning, only the log does. Log each run as a **dated comment**: the prose converted and the check id it became, or "nothing convertible this run".

## What this task must never do

- **Never ship a check that can't be made confident** — the see-it-fail fixture is the gate; an unprovable rule stays prose.
- **Never convert a rule an existing check already covers** — dedupe against the check set first.
- **Never reach outside this repo** — it is canon-local; it edits only the canon's own corpus.
- **Run on `opus`** — judging convertibility and authoring checks + fixtures is heavy judgment; this task declares `agent_model: opus` and the executor dispatches its subagent there.
