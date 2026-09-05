# flutter pack

Active when the repo has `pubspec.yaml`. Durable, project-agnostic Flutter practices in
`RULES.md`, earned in missingbulb/ShoutsAndWhispers: ports-and-adapters out of the widget tree
(with the committed import-boundary test and the shipped fake world), widget-test/golden mechanics
(real fonts, no `pumpAndSettle` on spinners, injectable fetchers, fixed viewport, the async-epoch
guard), and toolchain habits (pub-cache API verification, zero-issue analyze, stall-robust test
runners for sandboxes). Prose and two skills — the enforceable pieces (import scan, coverage gates) live as
committed tests inside the consuming project.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Widgets depend on ports, never on plugins. | medium | complexity | prose: 70 words |
| Enforce the boundary with an import scan | medium | complexity | prose: 25 words |
| Ship the fakes in the package | low | complexity | prose: 59 words |
| Extract the root shell into a widget | low | complexity | prose: 38 words |
| Inject the clock. | high | correctness | prose: 25 words |
| Anything that fetches must be injectable | medium | complexity | prose: 47 words |
| Async lifecycle guards need an epoch counter. | high | correctness | prose: 51 words |
| Real I/O in testWidgets needs runAsync | high | correctness | prose: 67 words |
| Verify plugin APIs against installed source | high | correctness | prose: 41 words |
| flutter analyze at zero issues | medium | complexity | prose: 39 words |
| Sandboxed/CI runners | medium | complexity | prose: 57 words |

The golden mechanics are the [`flutter-golden-tests`](skills/flutter-golden-tests/SKILL.md) skill
and lockfile skew is [`flutter-pubspec`](skills/flutter-pubspec/SKILL.md); each forces itself for
the files it concerns.

## Skills

| Skill | Trigger |
|---|---|
| [`flutter-golden-tests`](skills/flutter-golden-tests/SKILL.md) | any edit of a `*_test.dart` or a Dart file under `test/` — held by the guard until loaded |
| [`flutter-pubspec`](skills/flutter-pubspec/SKILL.md) | any edit of `pubspec.yaml` or `pubspec.lock` — held by the guard until loaded |

## Environment

The Claude Code web sandbox boots without a Flutter SDK, so `flutter test`, `flutter analyze` and
golden regeneration can't run until it is installed. The install belongs in the environment
**image** (built once, snapshotted, reused), never a per-session hook that reinstalls every start:
this pack declares that need in its `env` block ([pack.mjs](pack.mjs)), and a project pastes one
generic `environment-setup-command.sh` that runs every active pack's requirement via
[engine/pack_loader/env-requirements.mjs](../../engine/pack_loader/env-requirements.mjs) and asserts
it at session start (see [bootstrap.md](../../bootstrap.md) Part 9).
