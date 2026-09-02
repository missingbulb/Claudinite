# Python

- **Adding a heavy, native or ML dependency to a Python package** — declare it under a named
  `[project.optional-dependencies]` extra, never in base `dependencies`: the core (logic, storage,
  CLI, any web layer) must import, run and be fully testable on a bare `pip install <pkg>` with the
  standard library alone.

- **Wrapping a heavy backend behind an interface** — ship a stdlib-only implementation of that same
  interface for the test suite and any offline mode, and select between them at runtime through a
  `load_default()`/registry that lazy-imports only the chosen one, so the wiring module imports
  neither at load time.

- **Importing a module only to probe whether an optional stack is present** — its name is never
  used, so the linter's unused-import (`F401`) is a false positive: mark the line `# noqa: F401`
  and record the deliberate suppression rather than deleting the probe or letting the warning ride.
