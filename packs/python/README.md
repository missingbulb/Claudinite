# python pack

Active when the repo has a `pyproject.toml` at the root (or one directory down). The
package built around an optional heavy/native dependency. Two of the rules mechanize
into check-the-work rules (mounted via the [`python-optional-deps`](skills/python-optional-deps/SKILL.md)
skill, run at every Stop and in CI — each failure message is the rule); the rest is
architecture judgment with no false-positive-free signature, kept as prose.

| Rule (≤5 words) | How enforced |
|---|---|
| Import optional deps lazily | skill check `python-optional-import-top-level` |
| `ImportError` re-raise names the extra | skill check `python-optional-import-install-hint` (advisory) |
| Core importable with stdlib only | prose (`RULES.md`) |
| Stdlib backend keeps tests dep-free | prose (`RULES.md`) |
| `# noqa: F401` the availability probe | prose (`RULES.md`) |

The two checks are gated on the repo declaring `[project.optional-dependencies]` in a
`pyproject.toml` — the only place a package is declared optional, which is what makes a
top-level import (or an unhelpful guard re-raise) of one a false-positive-free signal.
Code whose import name is unrelated to its distribution name, and the "which deps count
as heavy" call, have no such signature and stay prose.

**Provenance.** Distilled from `missingbulb/LaughCounter` — a stdlib-only core (counting, storage, CLI, web dashboard) with the YAMNet/TensorFlow laughter model and the Torch/SpeechBrain speaker model behind `[project.optional-dependencies]` extras (`pyproject.toml`), lazily imported per backend (`laughcounter/detector/__init__.py`'s `load_default`, `detector/yamnet.py`), each guarded by a `try/except ImportError` that names the `pip install "laughcounter[…]"` extra, with a stdlib `ScriptedDetector` that runs the tests and the offline `simulate` mode. The deliberate `F401` availability-probe suppressions are recorded in that repo's `.claudinite-checks.json`.
