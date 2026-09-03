# Python

- **Wrapping a heavy backend behind an interface** — ship a stdlib-only implementation of that same
  interface for the test suite and any offline mode, and select between them at runtime through a
  `load_default()`/registry that lazy-imports only the chosen one, so the wiring module imports
  neither at load time.
