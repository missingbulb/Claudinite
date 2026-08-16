# executable-requirements pack

Active when the repo has `dev/requirements/requirements.md`. The concrete framework standard for
running a spec as tests: layout, case naming, the coverage gate's duties, the kind vocabulary
(including the storyboard `saga` kind), the machine-managed gallery, and the determinism rules that
make rendered expecteds byte-stable. Prose-only: every rule here is enforced by gates **the
declaring project itself commits** (coverage gate, gallery gate) — the pack standardizes what those
gates must check, not the checking.

Sits under [spec-driven-product](../spec-driven-product/README.md), which owns the judgment layer
(doc-first discipline, owner-owned expecteds, honest-gap tracking) — declare both for a product
project of that class. This pack exists so a *new* project (or a new stack) adopts the framework by
convention instead of re-deriving it.

Distilled from three worked implementations in the owner's fleet:
missingbulb/GoogleCalendarEventCreator (`dev/requirements/` — the origin: jsdom+satori rendering,
pixel-exact snapshots), missingbulb/TLDR (adds the cross-tier `server` kind), and
missingbulb/ShoutsAndWhispers (`dev/requirements/` — the Flutter port: golden-file rendering, the
fake-world harness, and the `saga` storyboard kind's first implementation).

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| A requirement line | 42 | medium | complexity | prose |
| The line is a scannable one-liner; expanded detail collapses. | 77 | low | complexity | prose |
| The folder is the kind. | 41 | medium | complexity | prose |
| Artifact expecteds live beside their case | 66 | medium | complexity | prose |
| surface snapshot | 33 | medium | correctness | prose |
| behavior | 22 | medium | correctness | prose |
| logic | 12 | low | correctness | prose |
| saga | 10 | low | correctness | prose |
| per-project kinds | 41 | low | complexity | prose |
| heavy/e2e singleton | 21 | medium | performance | prose |
| Strip dead delay, keep the animation. | 49 | medium | performance | prose |
| Lossless, so byte-identity still holds. | 70 | high | correctness | prose |
| Mark the gesture. | 30 | medium | correctness | prose |
| Pin the clock. | 26 | high | correctness | prose |
| Fake every nondeterministic input | 31 | high | correctness | prose |
| Load real fonts | 51 | high | correctness | prose |
| Never wait for "settled". | 21 | high | correctness | prose |
| Browser-extension / DOM products | 58 | medium | correctness | prose |
| Flutter | 91 | medium | correctness | prose |

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `feature-requirements-first` | blocking | high | correctness | a feature reaches the requirements document before the code that implements it |
