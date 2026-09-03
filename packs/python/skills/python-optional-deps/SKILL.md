---
name: python-optional-deps
description: Wiring a Python package's optional heavy/native dependency — declaring the extra, importing the selected backend lazily, and guarding that import. Use when adding or changing an optional dependency or a heavy backend behind an interface.
---

# Python optional dependencies

Declare heavy/native packages under `[project.optional-dependencies]`, wire the selected backend behind a tiny interface, and keep a stdlib-only implementation for the tests and offline modes.
