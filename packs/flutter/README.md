# flutter pack

Active when the repo has `pubspec.yaml`. Durable, project-agnostic Flutter practices in
`RULES.md`, earned in missingbulb/ShoutsAndWhispers: ports-and-adapters out of the widget tree
(with the committed import-boundary test and the shipped fake world), widget-test/golden mechanics
(real fonts, no `pumpAndSettle` on spinners, injectable fetchers, fixed viewport, the async-epoch
guard), and toolchain habits (pub-cache API verification, zero-issue analyze, stall-robust test
runners for sandboxes). Prose-only — the enforceable pieces (import scan, coverage gates) live as
committed tests inside the consuming project.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Widgets depend on ports, never on plugins. | medium | complexity | prose: 70 words |
| Enforce the boundary with an import scan | medium | complexity | prose: 25 words |
| Ship the fakes in the package | low | complexity | prose: 59 words |
| Extract the root shell into a widget | low | complexity | prose: 38 words |
| Inject the clock. | high | correctness | prose: 25 words |
| Load real fonts before any golden | high | correctness | prose: 75 words |
| Never pumpAndSettle around indeterminate progress indicators | high | correctness | prose: 59 words |
| Anything that fetches must be injectable | medium | complexity | prose: 47 words |
| Fix the viewport per suite | medium | correctness | prose: 31 words |
| Async lifecycle guards need an epoch counter. | high | correctness | prose: 51 words |
| Verify plugin APIs against installed source | high | correctness | prose: 41 words |
| A lone pubspec.lock move is version skew | medium | correctness | prose: 69 words |
| flutter analyze at zero issues | medium | complexity | prose: 39 words |
| Sandboxed/CI runners | medium | complexity | prose: 57 words |
| The web sandbox ships no Flutter SDK. | medium | complexity | prose: 81 words |
