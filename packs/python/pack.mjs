// Technology pack: Python packaging around an optional heavy/native dependency.
// Fingerprint: a `pyproject.toml` at the repo root OR one directory down (a
// subproject/tool dir), never deeper, so a pyproject.toml inside a nested
// fixture/example/vendored tree can't trip detection. (`setup.py`/`setup.cfg`
// are the older equivalent markers; add them here if a consumer predates
// pyproject.toml.)
export default {
  version: '60925.2',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'packaging and import conventions for a Python project — pyproject extras, lazy optional heavy deps, stdlib-only core',
    excludes: 'npm and module packaging — that is node; research methodology is research-project',
  },
  pitch: 'For a Python package built around an optional heavy or native dependency, this pack keeps the package importable and useful without it. The python-optional-deps skill shows Claude Code sessions how to put that dependency behind a lazy, guarded import with a clear install hint, and a couple of checks enforce it: a blocking one catches a top-level import of an optional package, and an advisory one flags a missing install hint. A few rules also favour shipping a standard-library fallback behind the same interface.',
  locate: { about: 'pyproject.toml (at the repo root or one directory down)', paths: /^([^/]+\/)?pyproject\.toml$/ },
};
