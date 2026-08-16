# flutter pack

Active when the repo has `pubspec.yaml`. Durable, project-agnostic Flutter practices in
`RULES.md`, earned in missingbulb/ShoutsAndWhispers: ports-and-adapters out of the widget tree
(with the committed import-boundary test and the shipped fake world), widget-test/golden mechanics
(real fonts, no `pumpAndSettle` on spinners, injectable fetchers, fixed viewport, the async-epoch
guard), and toolchain habits (pub-cache API verification, zero-issue analyze, stall-robust test
runners for sandboxes). Prose-only — the enforceable pieces (import scan, coverage gates) live as
committed tests inside the consuming project.

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Widgets depend on ports, never on plugins. | 70 | medium | complexity | prose |
| Enforce the boundary with a committed import-scan test | 25 | medium | complexity | prose |
| Ship the fakes in the package | 59 | low | complexity | prose |
| Extract the root shell into a widget | 38 | low | complexity | prose |
| Inject the clock. | 25 | high | correctness | prose |
| Load real fonts before any golden | 75 | high | correctness | prose |
| Never pumpAndSettle around indeterminate progress indicators | 59 | high | correctness | prose |
| Anything that fetches must be injectable | 47 | medium | complexity | prose |
| Fix the viewport per suite | 31 | medium | correctness | prose |
| Async lifecycle guards need an epoch counter. | 51 | high | correctness | prose |
| Verify plugin APIs against the installed source, not memory. | 41 | high | correctness | prose |
| pubspec.lock moving without pubspec.yaml moving is version skew, not a dependency change. | 69 | medium | correctness | prose |
| flutter analyze at zero issues | 39 | medium | complexity | prose |
| Sandboxed/CI runners | 57 | medium | complexity | prose |
| The web sandbox ships no Flutter SDK. | 81 | medium | complexity | prose |
