# flutter pack

Active when the repo has `pubspec.yaml`. Durable, project-agnostic Flutter practices in
`RULES.md`, earned in missingbulb/ShoutsAndWhispers: ports-and-adapters out of the widget tree
(with the committed import-boundary test and the shipped fake world), widget-test/golden mechanics
(real fonts, no `pumpAndSettle` on spinners, injectable fetchers, fixed viewport, the async-epoch
guard), and toolchain habits (pub-cache API verification, zero-issue analyze, stall-robust test
runners for sandboxes). Prose-only — the enforceable pieces (import scan, coverage gates) live as
committed tests inside the consuming project.

## Prose (`RULES.md`) — by section

| Section (≤5 words) | How enforced |
|---|---|
| Ports out of widget tree | prose (+ the project's import-scan test) |
| Widget tests and goldens | prose (+ the project's harness) |
| Toolchain habits | prose |
