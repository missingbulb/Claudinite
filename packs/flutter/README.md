# flutter pack

Active when the repo has `pubspec.yaml`. Durable, project-agnostic Flutter practices, earned in
missingbulb/ShoutsAndWhispers: ports-and-adapters out of the widget tree (with the committed
import-boundary test and the shipped fake world), widget-test/golden mechanics (real fonts, no
`pumpAndSettle` on spinners, injectable fetchers, fixed viewport, the async-epoch guard), and
toolchain habits (pub-cache API verification, zero-issue analyze, stall-robust test runners for
sandboxes). Prose and skills only — the enforceable pieces (import scan, coverage gates) live as
committed tests inside the consuming project.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Widgets depend on ports, never on plugins. | medium | complexity | prose: 70 words |
| Inject the clock. | high | correctness | prose: 25 words |
| Anything that fetches must be injectable | medium | complexity | prose: 47 words |
| Async lifecycle guards need an epoch counter. | high | correctness | prose: 51 words |
| Verify plugin APIs against installed source | high | correctness | prose: 41 words |
| flutter analyze at zero issues | medium | complexity | prose: 39 words |
| Sandboxed/CI runners | medium | complexity | prose: 57 words |

The rules a session needs only on one job are skills: the golden mechanics are
[`flutter-golden-tests`](skills/flutter-golden-tests/SKILL.md), lockfile skew is
[`flutter-pubspec`](skills/flutter-pubspec/SKILL.md), and the port boundary's test, fakes and root
shell are [`flutter-port-architecture`](skills/flutter-port-architecture/SKILL.md); each forces
itself for the files it concerns.

## Skills

| Skill | Trigger |
|---|---|
| [`flutter-golden-tests`](skills/flutter-golden-tests/SKILL.md) | writing or debugging a widget test or golden; any edit of `*_test.dart` or a `.dart` file under `test/` — held by the guard until loaded |
| [`flutter-pubspec`](skills/flutter-pubspec/SKILL.md) | `pubspec.lock` showing up in a diff; any edit of `pubspec.yaml` or `pubspec.lock` — held by the guard until loaded |
| [`flutter-port-architecture`](skills/flutter-port-architecture/SKILL.md) | adding a port, fake or plugin adapter; any edit under `lib/testing/`, or of `lib/app.dart` or `lib/main.dart` — held by the guard until loaded |

## Environment

The Claude Code web sandbox boots without a Flutter SDK, so `flutter test`, `flutter analyze` and
golden regeneration can't run until it is installed. The install belongs in the environment
**image** (built once, snapshotted, reused), never a per-session hook that reinstalls every start:
this pack declares that need in its `env` block ([pack.mjs](pack.mjs)), and a project pastes one
generic `environment-setup-command.sh` that runs every active pack's requirement via
[engine/pack_loader/env-requirements.mjs](../../engine/pack_loader/env-requirements.mjs) and asserts
it at session start (see [bootstrap.md](../../bootstrap.md) Part 9).
