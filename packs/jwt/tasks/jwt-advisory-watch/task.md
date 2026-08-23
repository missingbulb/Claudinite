# jwt-advisory-watch worker

The **assess-only** advisory watch of the jwt pack: a monthly pass checking the repo's JWT/JOSE
libraries against published security advisories. GitHub access is **MCP-only** (`mcp__github__*`).

**Never open a PR or edit a dependency manifest.** You recommend; a human bumps.

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
If this session has **no working lookup path**, say `advisory lookup unavailable this run` in the run's
own outcome instead of guessing — an empty result must mean "checked and clean", never "couldn't check".

## 3. File an issue only for an actual hit

There is **no standing tracker**: a monthly issue body rewritten to say "all clean" is a subscription
to noise, and it buries the one month it says something else. A clean run writes nothing anywhere —
its record is the run's own outcome, which already says the sweep ran.

A run that found **at least one advisory affecting a resolved version** opens a real, **open** issue —
one per run, so each carries its own advisory set and closes when those bumps land. Title it
`JWT advisory: <lib>@<version> and N other(s)` (or just the one library when it is the only hit), and
give the body one line per hit — `lib@version — GHSA-xxxx (severity): fixed in X.Y.Z` — plus the
manifest each library came from, so whoever bumps it knows where to look. Nothing here touches a
dependency.

Before opening one, search the repo's open issues for a `JWT advisory:` issue naming the same GHSA
against the same library: if one is already open, this advisory is already filed, so comment nothing
and open nothing. It is the **GHSA id against the library** you match on, never the title text — every
run phrases its own title, and a title match would file a duplicate the moment the set of hits changed.

`model: sonnet` — deciding whether a resolved version sits inside an advisory's affected range is a
judgment call; rendering the hits that survive it is mechanical.
