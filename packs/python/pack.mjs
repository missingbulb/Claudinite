// Technology pack: Python packaging around an optional heavy/native dependency.
// Prose-only — the rules are judgment (which deps count as "heavy", whether an
// import is safe at module scope), with no false-positive-free static signature,
// so nothing mechanizes into a check yet.
//
// Fingerprint: a `pyproject.toml` at the repo root OR one directory down (a
// subproject/tool dir) — but never deeper, so a pyproject.toml inside a nested
// fixture/example/vendored tree can't trip detection. (`setup.py`/`setup.cfg`
// are the older equivalent markers; add them here if a consumer predates
// pyproject.toml.)
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  id: 'python',
  marker: 'pyproject.toml (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'pyproject.toml'),
  prose: 'RULES.md',
  rules: [],
};
