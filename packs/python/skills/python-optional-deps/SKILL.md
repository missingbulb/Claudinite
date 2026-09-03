---
name: python-optional-deps
description: Wiring a Python package's optional heavy/native dependency — declaring the extra, importing the selected backend lazily, and guarding that import. Use when adding or changing an optional dependency or a heavy backend behind an interface.
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
