# Python

Portable, project-agnostic practices for a Python package built around an optional
heavy/native dependency (an ML model, a native audio/GPU library, a cloud SDK) that
most of the codebase — and the whole test suite — must run without. The theme is one:
**keep the importable core dependency-free, and gate every heavy thing behind an
optional extra.** What stays here is the architecture judgment that has no
false-positive-free static signature; the mechanical shape of the optional import
itself (imported lazily, guarded with an install-hint re-raise) is carried by the
`python-optional-deps` skill.

## Keep the importable core dependency-free; heavy/native deps go in optional extras, not base `dependencies`

The core of a package (its logic, storage, CLI, any web/dashboard layer) should import
and run — and be **fully testable** — with only the Python standard library. Declare
`dependencies = []` (or the genuinely-always-needed minimum) in `[project]`, and put every
heavy, native, or ML dependency under a **named `[project.optional-dependencies]` extra**
(`pkg[yamnet]`, `pkg[speaker]`, `pkg[dev]`), so installing the package is cheap and the
heavy stack is pulled only when a user opts into the feature that needs it.

The payoff is a test suite that runs anywhere with no ML/native toolchain: the offline
and mock paths exercise the whole pipeline, and CI never has to install TensorFlow or
Torch to be green. If a `pip install <pkg>` with no extra can't import the core, a heavy
dependency has leaked into the base set — move it to an extra. Whether a given dependency
is "heavy" enough to belong in an extra is a judgment about the package's shape, which is
why this stays prose.

## Provide a stdlib-only implementation behind the same interface so tests and offline modes need no extra

Give the swappable interface a **dependency-free** implementation — a scripted/mock
backend built on the standard library alone — alongside the heavy real one. That
stdlib backend is what the test suite and any offline/`simulate` mode run on, so the
full pipeline is exercised end-to-end without the ML or native stack ever being
installed. The heavy backend is then just one more implementation of the interface,
selected at runtime, never a hard import the core or the tests depend on. The clean
shape is a tiny backend interface plus a `load_default()`/registry that lazy-imports the
*selected* backend by name — so the module that wires backends together never imports
any of them at load time, and adding a heavy backend never taxes the core.

## Mark the availability-probe import as a deliberate unused-import suppression

An import kept **only** to probe whether an optional stack is present (its name is never
used directly — the code just branches on whether the import succeeded) is a real linter
false-positive for unused-import (`F401`). Mark that line `# noqa: F401` and record the
deliberate suppression, rather than deleting the probe or letting the warning ride.
Whether an import is a genuine probe or an accidental unused import is a judgment a
static scan can't make without a full unused-name analysis, so it stays prose.
