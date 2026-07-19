# python pack

Active when the repo has a `pyproject.toml` at the root (or one directory down). Prose-only — the optional-dependency discipline is judgment, with no false-positive-free static signature to mechanize (yet).

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Core importable with stdlib only | prose |
| Import heavy deps lazily | prose |
| `ImportError` names the extra to install | prose |
| Stdlib backend keeps tests dep-free | prose |

**Provenance.** Distilled from `missingbulb/LaughCounter` — a stdlib-only core (counting, storage, CLI, web dashboard) with the YAMNet/TensorFlow laughter model and the Torch/SpeechBrain speaker model behind `[project.optional-dependencies]` extras (`pyproject.toml`), lazily imported per backend (`laughcounter/detector/__init__.py`'s `load_default`, `detector/yamnet.py`), each guarded by a `try/except ImportError` that names the `pip install "laughcounter[…]"` extra, with a stdlib `ScriptedDetector` that runs the tests and the offline `simulate` mode. The deliberate `F401` availability-probe suppressions are recorded in that repo's `.claudinite-checks.json`.
