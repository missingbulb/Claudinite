# issue-triage worker

For each issue in `targets.issues` (the plan hands you the numbers), run the
[single-issue-triage](../../../skills/single-issue-triage/SKILL.md) skill. This is the one tidy task
that **acts** — close / label / comment per the first applicable rule.

The skill owns the action ladder and the safeguards: "implemented in `main`" is verified against
`main`'s current content and cited, never inferred; when inconclusive it **comments, doesn't close**.
Collect what each issue's triage did; that feeds the repo's `tidy-report` for the standing tracker.

`smarts: medium` — deciding the ask is verifiably true of `main` is the judgment.
