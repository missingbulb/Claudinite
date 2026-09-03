# research-project pack

A project-class pack (prose-only, declared — no fingerprint) for the recurring class: run an algorithm over similarly-formatted inputs, score against user ground truth, improve in reviewable iterations. Its sections are all prose (methodology and judgment, no static signatures to check); the section numbers are stable identifiers and keep their gaps where a section's content became a skill.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Never annotate in the signal's own colour | medium | correctness | prose: 63 words |
| Show where the method breaks | high | correctness | prose: 71 words |
| Say which reported numbers are trustworthy | high | correctness | prose: 112 words |
| Show the owner pictures, proactively | medium | complexity | prose: 35 words |
| Leave finished work committed and pushed | medium | complexity | prose: 24 words |
| The owner's annotations are the ground truth. | high | correctness | prose: 24 words |
| Ground truth is annotated, never fabricated. | critical | correctness | prose: 41 words |
| State the input format explicitly | medium | complexity | prose: 26 words |
| Name the target regime and its scope | medium | complexity | prose: 42 words |
| Scale-awareness is a first-class concern. | medium | correctness | prose: 50 words |
| No single-input special-casing. | high | correctness | prose: 35 words |
| Keep the measured prior out of decisions | high | correctness | prose: 50 words |
| Prefer scale-free rules over pixel/absolute constants. | medium | correctness | prose: 34 words |
| Name the constraint the task can't trade | medium | complexity | prose: 52 words |
| Register each domain assumption's failure mode | high | correctness | prose: 74 words |
| Guard the wins with regression tests. | high | correctness | prose: 29 words |
| Source updated — never the generated artifacts. | high | correctness | prose: 10 words |
| Artifacts regenerated | medium | correctness | prose: 7 words |
| Tests green | medium | correctness | prose: 12 words |
| Committed with a clear message and pushed | medium | complexity | prose: 22 words |
| Learnings cached | medium | complexity | prose: 29 words |
| Separate work into explicit phases | medium | complexity | prose: 46 words |
| Distinguish research spikes from the maintained pipeline. | medium | complexity | prose: 46 words |
| Keep a deferred-items list | medium | complexity | prose: 25 words |
| A fresh container has nothing installed. | medium | complexity | prose: 47 words |
| Gate and isolate a heavy learned route | medium | complexity | prose: 43 words |
| Route around missing system binaries with libraries | low | complexity | prose: 30 words |
| Take an exhausted direction seriously | medium | complexity | prose: 40 words |
| Evaluate it like any other change | medium | correctness | prose: 29 words |
| Beat the naive baseline, or drop it. | high | correctness | prose: 84 words |
| Document the outcome fully | medium | complexity | prose: 50 words |
| Complementary routes are not competitors. | low | complexity | prose: 25 words |
| Commit and push | medium | complexity | prose: 16 words |
| Maintain a session warm-up doc | low | complexity | prose: 43 words |
| Maintain a continuation guide | medium | complexity | prose: 29 words |
| Capture the owner's new way durably | medium | complexity | prose: 139 words |

The activity-bound procedure moved into skills: ground-truth extraction, source intake (reading a
source and extracting its images), adding an external corpus, the iteration-note template, metric
definition and calibration, and the revived-session preference mining. Each loads on its activity
from its description; none is path-scoped.

## Skills

| Skill | Trigger |
|---|---|
| [`ground-truth-extraction`](skills/ground-truth-extraction/SKILL.md) | adding a dataset, writing or changing an extraction script, or fixing ground truth |
| [`source-intake`](skills/source-intake/SKILL.md) | reading a paper, tool or reference method that matters to the project |
| [`add-an-external-corpus`](skills/add-an-external-corpus/SKILL.md) | fetching more sample data from public sources |
| [`write-an-iteration-note`](skills/write-an-iteration-note/SKILL.md) | recording an accepted algorithmic change |
| [`define-and-calibrate-metrics`](skills/define-and-calibrate-metrics/SKILL.md) | defining, redefining, aggregating or comparing a reported metric |
| [`mine-session-for-preferences`](skills/mine-session-for-preferences/SKILL.md) | the owner revives a prior session and points it at the playbook |
