# research-project pack

A project-class pack (prose-only, declared — no fingerprint) for the recurring class: run an algorithm over similarly-formatted inputs, score against user ground truth, improve in reviewable iterations. Its 14 sections are all prose (methodology and judgment, no static signatures to check).

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Never draw an annotation in a colour the underlying signal itself carries. | 63 | medium | correctness | prose |
| Show where the method breaks, not only where it works. | 71 | high | correctness | prose |
| Say which of the numbers you just reported are trustworthy, where you report them. | 112 | high | correctness | prose |
| The owner's annotations are the ground truth. | 24 | high | correctness | prose |
| Ground truth is annotated, never fabricated. | 38 | critical | correctness | prose |
| Separate source-of-truth from generated artifacts. | 52 | high | correctness | prose |
| Make extraction deterministic and self-checking. | 34 | high | correctness | prose |
| Auto-detect annotation conventions from the data | 53 | medium | correctness | prose |
| Verify the annotation actually parses before trusting a score. | 42 | high | correctness | prose |
| State the input format explicitly | 26 | medium | complexity | prose |
| Name the primary target regime and what is out of scope. | 42 | medium | complexity | prose |
| Scale-awareness is a first-class concern. | 50 | medium | correctness | prose |
| No single-input special-casing. | 35 | high | correctness | prose |
| Keep decision rules free of the very prior you are trying to measure. | 50 | high | correctness | prose |
| Prefer scale-free rules over pixel/absolute constants. | 34 | medium | correctness | prose |
| Name the hard constraint the task cannot trade away | 52 | medium | complexity | prose |
| Keep a registry of domain assumptions, each with a failure mode. | 74 | high | correctness | prose |
| Guard the wins with regression tests. | 29 | high | correctness | prose |
| What was wrong | 14 | low | complexity | prose |
| What changed | 12 | low | complexity | prose |
| The metric delta | 13 | medium | complexity | prose |
| What you tried and rejected, and why | 28 | medium | complexity | prose |
| Source updated — never the generated artifacts. | 10 | high | correctness | prose |
| Artifacts regenerated | 7 | medium | correctness | prose |
| Tests green | 12 | medium | correctness | prose |
| Committed with a clear message and pushed | 22 | medium | complexity | prose |
| Learnings cached | 27 | medium | complexity | prose |
| Separate work into explicit phases | 46 | medium | complexity | prose |
| Distinguish research spikes from the maintained pipeline. | 46 | medium | complexity | prose |
| Keep a "known open items" / deferred list | 25 | medium | complexity | prose |
| Write a self-contained notes file so the source never has to be re-read. | 40 | medium | complexity | prose |
| Capture the method that exists only inside a figure. | 58 | medium | complexity | prose |
| Write down what the source fails to say | 63 | medium | complexity | prose |
| Explicitly record where your approach diverges from the reference and why. | 12 | low | complexity | prose |
| State what you deliberately omitted | 65 | medium | complexity | prose |
| Samples | 35 | medium | correctness | prose |
| Render documents with a library, not an assumed system binary. | 62 | medium | correctness | prose |
| Verify identity when an extracted image should match an existing input | 43 | medium | correctness | prose |
| Grow the corpus from public sources that match the input regime. | 35 | medium | correctness | prose |
| Make ingestion a committed, repeatable fetch script | 18 | medium | complexity | prose |
| Respect the two validation tiers — and don't mix them: | 78 | high | correctness | prose |
| External data is rarely drop-in. | 26 | medium | correctness | prose |
| A fresh container has nothing installed. | 47 | medium | complexity | prose |
| When a heavy or learned approach is genuinely the right tool, treat it as a gated, isolated route | 43 | medium | complexity | prose |
| Route around missing system binaries with libraries | 29 | low | complexity | prose |
| Take the suggestion seriously even when the project has declared a direction "exhausted." | 40 | medium | complexity | prose |
| Evaluate it the same way as any change | 29 | medium | correctness | prose |
| Beat the naive baseline, or drop it. | 83 | high | correctness | prose |
| Document the outcome fully | 50 | medium | complexity | prose |
| Complementary routes are not competitors. | 25 | low | complexity | prose |
| Commit and push | 16 | medium | complexity | prose |
| Maintain a session warm-up doc | 43 | low | complexity | prose |
| Maintain a continuation guide | 29 | medium | complexity | prose |
| When the owner asks for a different way to do something, capture the new way durably — don't just do it this once. | 140 | medium | complexity | prose |
