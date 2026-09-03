# python pack

Active when the repo has a `pyproject.toml` at the root (or one directory down). The
package built around an optional heavy/native dependency. Two of the rules mechanize
into check-the-work rules (mounted via the [`python-optional-deps`](skills/python-optional-deps/SKILL.md)
skill, run at every Stop and in CI — each failure message is the rule); the rest is
architecture judgment with no false-positive-free signature, kept as prose.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Keep the importable core dependency-free | high | complexity | prose: 50 words + skill check (`python-optional-import-top-level`) |
| Ship a stdlib-only backend behind the interface | medium | complexity | prose: 49 words |
| Mark the availability-probe import suppressed | low | complexity | prose: 49 words + skill check (`python-optional-import-install-hint`) |

## Checks

Both ride the [`python-optional-deps`](skills/python-optional-deps/SKILL.md) skill's bundle.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `python-optional-import-top-level` | high | correctness | check: blocking |
| `python-optional-import-install-hint` | medium | complexity | check: advisory |

The two checks are gated on the repo declaring `[project.optional-dependencies]` in a
`pyproject.toml` — the only place a package is declared optional, which is what makes a
top-level import (or an unhelpful guard re-raise) of one a false-positive-free signal.
Code whose import name is unrelated to its distribution name, and the "which deps count
as heavy" call, have no such signature and stay prose.

**Provenance.** Distilled from `missingbulb/LaughCounter` — a stdlib-only core (counting, storage, CLI, web dashboard) with the YAMNet/TensorFlow laughter model and the Torch/SpeechBrain speaker model behind `[project.optional-dependencies]` extras (`pyproject.toml`), lazily imported per backend (`laughcounter/detector/__init__.py`'s `load_default`, `detector/yamnet.py`), each guarded by a `try/except ImportError` that names the `pip install "laughcounter[…]"` extra, with a stdlib `ScriptedDetector` that runs the tests and the offline `simulate` mode. The deliberate `F401` availability-probe suppressions are recorded in that repo's `.claudinite-settings.json`.
