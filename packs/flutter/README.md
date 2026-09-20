# flutter pack

Active when the repo has `pubspec.yaml`. Durable, project-agnostic Flutter practices in
`RULES.md`, earned in missingbulb/ShoutsAndWhispers: ports-and-adapters out of the widget tree
(with the committed import-boundary test and the shipped fake world), widget-test/golden mechanics
(real fonts, no `pumpAndSettle` on spinners, injectable fetchers, fixed viewport, the async-epoch
guard), and toolchain habits (pub-cache API verification, zero-issue analyze, stall-robust test
runners for sandboxes). Prose, two checks and two skills — the enforceable pieces the pack cannot
judge from outside (import scan, coverage gates) live as committed tests inside the consuming
project.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Widgets depend on ports, never on plugins. | medium | complexity | prose: <100 words |
| Enforce the boundary with an import scan | medium | complexity | prose: <50 words |
| Ship the fakes in the package | low | complexity | prose: <100 words |
| Extract the root shell into a widget | low | complexity | prose: <50 words |
| Anything that fetches must be injectable | medium | complexity | prose: <50 words + check (`flutter/network-fetch-in-widget-tree`) |
| Async lifecycle guards need an epoch counter. | high | correctness | prose: <100 words |
| Real I/O in testWidgets needs runAsync | high | correctness | prose: <100 words |
| Verify plugin APIs against installed source | high | correctness | prose: <50 words |
| flutter analyze at zero issues | medium | complexity | prose: <50 words |
| Sandboxed/CI runners | medium | complexity | prose: <100 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `flutter/network-fetch-in-widget-tree` | medium | complexity | check: blocking |
| `flutter/device-clock-not-injected` | high | correctness | check: blocking |

`flutter/device-clock-not-injected` stands where a prose rule used to: the clock is already named
as a port by the architecture rule above it, so the check and its fix line carry the rest.

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
