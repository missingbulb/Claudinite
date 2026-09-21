# python pack

Active when the repo has a `pyproject.toml` at the root (or one directory down). The
package built around an optional heavy/native dependency. Two check-the-work rules ride the
[`python-optional-deps`](skills/python-optional-deps/SKILL.md) skill and run at every Stop and
in CI; that skill also carries the extra-declaration rule and opens whenever a packaging file
is edited. The rest is `RULES.md` prose.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Ship a stdlib-only backend behind the interface | medium | complexity | prose: <50 words |
| Mark the availability-probe import suppressed | low | complexity | prose: <50 words + skill check (`python-optional-import-install-hint`) |

## Checks

Both ride the [`python-optional-deps`](skills/python-optional-deps/SKILL.md) skill's bundle.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `python-optional-import-top-level` | high | correctness | check: blocking |
| `python-optional-import-install-hint` | medium | complexity | check: advisory |

Both are inert until the repo declares `[project.optional-dependencies]` in a `pyproject.toml`,
and they scope only to the packages it names there.
