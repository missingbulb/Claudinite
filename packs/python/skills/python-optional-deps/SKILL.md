---
name: python-optional-deps
description: Wiring a Python package's optional heavy/native dependency — declaring the extra, importing the selected backend lazily, guarding that import, and probing whether the optional stack is present. Use when adding or changing an optional dependency or a heavy backend behind an interface.
metadata:
  force-load-on-file-edits-paths:
    - "pyproject.toml"
    - "*/pyproject.toml"
    - "setup.cfg"
    - "*/setup.cfg"
    - "setup.py"
    - "*/setup.py"
---

# Python optional dependencies

Declare heavy/native packages under `[project.optional-dependencies]`, wire the selected backend behind a tiny interface, and keep a stdlib-only implementation for the tests and offline modes.

## Declaring the extra

- **Adding a heavy, native or ML dependency to a Python package** — declare it under a named
  `[project.optional-dependencies]` extra, never in base `dependencies`: the core (logic, storage,
  CLI, any web layer) must import, run and be fully testable on a bare `pip install <pkg>` with the
  standard library alone.

## Probing for the optional stack

- **Importing a module only to probe whether an optional stack is present** — its name is never
  used, so the linter's unused-import (`F401`) is a false positive: mark the line `# noqa: F401`
  and record the deliberate suppression rather than deleting the probe or letting the warning ride.
