## 2026-07-19 · born · python pack: optional-dep discipline as skill-owned checks and residue prose (#345)
- **Source:** missingbulb/LaughCounter: a stdlib-only importable core (counting, storage, CLI, web
  dashboard) with the YAMNet/TensorFlow laughter model and the Torch/SpeechBrain speaker model
  behind `[project.optional-dependencies]` extras, lazily imported per backend through
  `load_default`, each guarded by a `try/except ImportError` that names the `pip install` extra, and
  a stdlib `ScriptedDetector` that runs the tests and the offline `simulate` mode.
- **Reason:** the theme is one, keep the importable core dependency-free and gate every heavy thing
  behind an optional extra, and it is portable across any package built around an ML model, a native
  audio or GPU library or a cloud SDK. What splits the pack is where each rule can be judged: the
  repo's own `pyproject.toml` names exactly which packages are optional, so a top-level import of a
  self-declared-optional package is a false-positive-free file-scoped signal and mechanizes; which
  deps count as heavy, whether an interface warrants a stdlib mock, and whether an import is a
  genuine availability probe are architecture judgment with no such signature and stay prose.
- **Actor:** the growth-discover run, merged by @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by a `pyproject.toml` at the repo root or one
  directory down and never deeper, so a `pyproject.toml` inside a nested fixture, example or
  vendored tree cannot trip detection.
- **Landed:** #345 (Refs #303) · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers. It changes nothing a
  session does, every session in every declaring repo paid for it, and the README and the manifest's
  `ruleRoutingGuidance` already carried it. Across the corpus the sweep took non-rule prose from
  2,900 words to 1,080.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-27 · scope-changed · the fingerprint is a `relevanceDetector` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `relevanceDetector` (engine/pack_loader/relevance-detector.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.

## 2026-09-28 · reworded · the fingerprint's patterns are written as source strings
- **Reason:** a manifest that is data cannot hold a RegExp; each pattern is its source string, or {
  source, flags } where it carries a flag, and loads to the same RegExp.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.

## 2026-09-28 · reworded · the manifest's comments leave it, their decisions recorded here
- **Reason:** a manifest that is data carries no comments. What they decided: the fingerprint is a
  pyproject.toml at the root or one directory down, never deeper, so one inside a nested fixture or
  vendored tree cannot trip it; setup.py and setup.cfg are the older markers, to add if a consumer
  predates pyproject.toml.
- **Actor:** @missingbulb (owner), asking for pack.json manifests, their comments deleted or moved
  to a README or provenance.

## 2026-09-28 · moved · the manifest becomes pack.json
- **Reason:** a manifest that is data is read with no import and by any tool; the conversion wrote
  the module's evaluated export, and the pack loads identically.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
- **Mechanism:** pack.json, which the loader prefers over pack.mjs; a canon pack now needs engine
  60928.1, the first to read it.
