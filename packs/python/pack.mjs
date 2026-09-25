// Technology pack: Python packaging around an optional heavy/native dependency.
// Fingerprint: a `pyproject.toml` at the repo root OR one directory down (a
// subproject/tool dir), never deeper, so a pyproject.toml inside a nested
// fixture/example/vendored tree can't trip detection. (`setup.py`/`setup.cfg`
// are the older equivalent markers; add them here if a consumer predates
// pyproject.toml.)
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  version: '60922.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'packaging and import conventions for a Python project — pyproject extras, lazy optional heavy deps, stdlib-only core',
    excludes: 'npm and module packaging — that is node; research methodology is research-project',
  },
  marker: 'pyproject.toml (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'pyproject.toml'),
};
