// Technology pack: Python packaging around an optional heavy/native dependency.
// The mechanical rules about how the optional import itself is written — never
// at module top level, and guarded with a re-raise that names the extra — are
// carried by the mounted `python-optional-deps` skill's check-the-work rules
// (the failure message is the rule, so there is no prose copy to drift from).
// What stays as prose in RULES.md is the residue with no false-positive-free
// signature: which deps belong in the dependency-free base set, the stdlib-
// backend architecture, and the F401 availability-probe suppression.
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
