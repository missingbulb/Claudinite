# jwt-advisory-watch worker

The **assess-only** advisory watch of the jwt pack: a monthly pass checking the repo's JWT/JOSE
libraries against published security advisories. You run under the executor, dispatched by a
`ready-for-agent` issue. GitHub access is **MCP-only** (`mcp__github__*`).

The task's declared outcome ceiling is **`none`**: **never open a PR, edit a dependency manifest, or
comment anywhere but this task's own tracker issue.** You recommend; a human bumps.

## 1. Enumerate the JWT surface

From the repo's dependency manifests and lockfiles (`package.json`/lockfiles, `pyproject.toml`/
`requirements*.txt`, `go.mod`, `Gemfile.lock`, …), list every JWT/JOSE library and its resolved
version. Names to look for (plus anything else JWT-shaped you encounter): `jsonwebtoken`, `jose`,
`node-jose`, `express-jwt`, `jwks-rsa`, `passport-jwt`, `PyJWT`, `python-jose`, `authlib`,
`golang-jwt`, `ruby-jwt`. No JWT libraries at all → record that and stop.

## 2. Check each against published advisories

For each library@version, check the GitHub Advisory Database (via the available `mcp__github__*`
search tools, or web lookup if this session has it) for advisories whose affected range includes
the resolved version. Collect one line per hit: `lib@version — GHSA-xxxx (severity): fixed in X.Y.Z`.
If this session has **no working lookup path**, write `advisory lookup unavailable this run` in the
tracker instead of guessing — an empty result must mean "checked and clean", never "couldn't check".

## 3. Reconcile this task's tracker

One standing tracker issue per repo, titled exactly `Claudinite tracker: JWT advisory watch` — found
by that **exact title, never a fuzzy match**; create it **already closed** if absent (never a fresh
issue per run). Touch it two ways each run:

- **Rewrite the issue body** to today's **dated** snapshot: the library list with versions, the
  advisory hits with their fixed-in versions (or "all clean" / "lookup unavailable"). The body is
  the live picture — it replaces last month's, it doesn't accumulate.
- **Add a dated comment** with today's status, so the body's snapshots leave a per-run trail.

Keep both short. **Never open, close, or reopen the tracker** — its state carries no meaning. The
tracker only *records* the recommendations; nothing here touches a dependency.

`model: sonnet` — deciding whether a resolved version sits inside an advisory's affected range is a
judgment call; the reconcile is mechanical aggregation.
