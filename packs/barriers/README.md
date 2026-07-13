# barriers pack

Enforce a **directed folder-access graph** in a repo: declare that the files under one folder may not reference another, and the check finds every crossing reference — across all languages and file types. The mechanism other packs compose their separation rules on.

Declared like any pack (no fingerprint — wanting structural segregation is the project's own call; a pack that needs it names `barriers` in its `requires`). Check-only, no prose: the finding is the instruction.

## Checks (hardcoded)

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `barrier` | folders honor declared access graph | blocking |

## Declaring barriers

A repo states its graph in `.claudinite-checks.json` under `packConfig.barriers.rules` — an array of edges:

```json
{
  "packs": ["basics", "barriers"],
  "packConfig": {
    "barriers": {
      "rules": [
        { "from": "src", "to": "tests", "reason": "source must not know about its tests" },
        { "between": ["client", "server"], "allow": ["shared", "contracts"],
          "reason": "client and server integrate only through the shared contract" },
        { "from": "dev/requirements", "to": "*", "allow": ["README.md"],
          "reason": "requirements is a pure sink — it references nothing outside itself" }
      ]
    }
  }
}
```

Edge shapes:

- **`{ from, to }`** — files under `from` may not reference `to`.
- **`{ between: [a, b] }`** — sugar for a mutual ban (both `a → b` and `b → a`).
- **`{ from, to: "*" }`** — **isolation / sink:** `from` may reference nothing *outside itself*. Other folders may still reference `from` freely (the graph is directed). Strict by default — carve out repo-root docs or shared infra with `allow`.
- **`allow: [...]`** (or a single `"allow": "shared"`) — folders reachable despite the ban (a `shared`/`contracts` folder both sides may use). Always implicitly allowed: references *within* `from` itself.
- **`reason`** — surfaced as the finding's *why*.

Paths are repo-relative folder prefixes; both `/` and `\` separators are accepted. `from`/`to` must be disjoint (a folder can't be barred from itself, an ancestor, or a descendant) — a malformed entry is a blocking `config` finding, not a silent no-op.

## How detection works — the tree is the oracle

The unit of detection is *a reference that resolves to a real tracked path inside the barred folder*. That single rule is what makes it language-agnostic and precise:

1. **Candidate extraction** — on every line of every file under `from` (comments and Markdown included): quoted strings (import specifiers, `require()`, `@import`, config values, JSON) **and** unquoted path-ish tokens.
2. **Resolution against the repo tree** — a candidate resolves via, in order: file-relative (`../server/db.js`, `..\server\db.js`), repo-root-relative (`server/db.js`), Python-style *absolute* dotted module (`import server.pkg.mod` → `server/pkg/mod.py`), then the unique-basename layer. Slash paths get extension/index completion (`../server/db` → `server/db.ts`, `../server` → `server/index.ts`, `../server/theme` → `server/_theme.scss`). The dotted-module attempt completes with **Python extensions only** (`.py`/`__init__.py`) — dotted notation is a Python/JVM module convention, so a JS `receiver.method()` call is never mistaken for a `receiver/method.js` module reference. A **bare `filename.ext`** resolves only when exactly one tracked file carries that basename — unique → no collision → no false positive.
3. **Verdict** — a candidate that resolves to a path under `to` (and not under `from` or an `allow` folder) is a crossing. A word that merely *looks like* a folder name — `"the API server is remote"`, a `https://server/...` URL, a `store.dispatch()` call — resolves to nothing and never fires.

**In scope for v1:** imports and path strings that resolve into the barred folder, plus unique `filename.ext` mentions — anywhere, comments and docs included. Vendored/generated files are excluded automatically (the runner drops them from `ctx.files`).

### Known limitations

The engine is **best-effort for imports and precise (no false positives) by design** — it would rather miss an exotic reference form than block on a guess. It does *not* resolve, and so does not catch, these crossings (a follow-up may add them; each needs real per-language handling):

- **Bare folder-*name* mentions** that resolve to no path (`"see the server module"` — the word alone). Too noisy to distinguish from prose.
- **Class/function symbol references** (a `from`-file *using* a symbol *defined* in `to`). Needs per-language symbol extraction and resolution.
- **Python *relative* imports** (`from ..server import x`) and **`from x import y`** name imports. Only the absolute dotted form (`import server.x`) resolves today.
- **Alias imports** (`@/server/db`, `~/server/db`, tsconfig/webpack `paths`). The engine has no project alias map.
- **Rust `::` paths** (`use crate::server::db;`).
- **Case-only differences** on case-insensitive filesystems (`../Server/db.js`). Matching is case-sensitive — the same behavior a Linux CI runtime has.

## Accepting a deliberate crossing

A crossing you mean to keep is an `accept` entry, reviewed once like any code:

```json
{ "rule": "barrier", "path": "client/legacy/bridge.js",
  "reason": "temporary bridge during the server split — tracked in #123" }
```

## Composing a barrier from another pack

The engine is exported so a pack can ship a *fixed* barrier as one of its own rules — no project config needed. Import `defineBarrier` and add the result to the pack's `rules`:

```js
// packs/<somepack>/pack.mjs
import { defineBarrier } from '../barriers/engine.mjs';

export default {
  id: 'somepack',
  requires: ['barriers'],
  rules: [
    defineBarrier({
      id: 'requirements-isolation',
      edges: [{ from: 'dev/requirements', to: '*', reason: 'requirements is a pure sink' }],
    }),
  ],
};
```

`engine.mjs` also exports the lower-level `normalizeEdges` and `barrierFindings` for a pack that needs finer control. This is the same "packs share the engine lib" pattern the `packs/` file-placement acceptance already covers.
