# The lockfile — end state

> **Status: proposed, not implemented.** A design under discussion; nothing below describes how
> the repository works today.

A member repository carries two Claudinite files at the top of its concerns, and they answer two
different questions:

| File | Question | Who writes it |
|---|---|---|
| `.claudinite-settings.json` | What does this repository **want**? | A person, or an adoption skill on their behalf |
| `.claudinite/lock.json` | What does this repository **have**? | The engine, and only the engine |

The settings file is the manifest: the declared packs, each entry's `config` and interview
`answers`, the `accept` waivers, the scheduler anchor. The lockfile is the record of the
resolution the engine last performed against that manifest: which engine and pack versions are
vendored under `.claudinite/shared/`, from which canon commit, with what content digest, and why
each pack is there. Neither file holds a value the other owns.

## 1. Shape

```json
{
  "lockfileVersion": 1,
  "manifestDigest": "sha256-…",
  "canon": { "repo": "missingbulb/Claudinite", "sha": "…" },
  "engine": { "version": "60902.1", "digest": "sha256-…" },
  "packs": {
    "basics":               { "version": "60915.8", "digest": "sha256-…", "declared": true,  "requires": ["claudinite-lifecycle", "git-github"] },
    "claudinite-lifecycle": { "version": "60915.4", "digest": "sha256-…", "declared": true,  "requires": [] },
    "git-github":           { "version": "60913.1", "digest": "sha256-…", "declared": false, "requires": [] }
  }
}
```

- **`lockfileVersion`** — the shape's own version, so an engine can refuse a lock it does not
  read rather than misread it. Every field below is judged against it.
- **`manifestDigest`** — a digest of the settings file's `packs` declaration (ids and `requires`
  closure only; `config`, `answers` and `accept` do not change what is vendored). A session-start
  probe compares it against the live settings file and reports a stale lock without resolving
  anything, the way Poetry's `content-hash` does.
- **`canon`** — the canon commit the vendored tree was computed from. It is provenance for a
  reader, never an input to a comparison: staleness is judged on versions, as today.
- **`engine`** and each **`packs.<id>`** — the version stamped, and a digest of the exact files
  the vendor set laid down for it. The digest is a tree hash over the relative path and content of
  each file, in sorted path order, so it is reproducible from the committed mount alone.
- **`declared`** — whether the manifest names the pack or the `requires` closure pulled it in.
  A pack that is here only through `requires` is still installed and still versioned; recording
  the reason is what lets the resolver drop it the moment nothing requires it.
- **`requires`** — the closure edge, copied from the manifest of the vendored pack version, so
  the lock is self-describing without loading a single `pack.mjs`.

Keys are sorted, the file is two-space JSON with a trailing newline, and a rewrite that changes
nothing produces byte-identical output: a lock diff in a pull request is a real change, every
time.

## 2. Who reads it

- **`installedVersions`** in `engine/installed-versions.mjs` reads the lock. It is the one
  question every update flow, the install flow, the vendor writer and the migration selector
  ask, and it keeps that role; only the file behind it changes.
- **The session-start self-test** verifies the mount against the lock: each recorded digest
  recomputed over the committed tree, and `manifestDigest` against the live manifest. A mismatch
  is reported by name (which pack, lock says / tree has), never repaired in the session.
- **The converge** compares the tree it built with the digests already recorded, and pushes
  nothing when they match.
- **The cross-repo readers** — the dashboard's fleet view, the fleet roster's freshness — fetch
  `.claudinite/lock.json` over the API where they fetch the settings file today.

## 3. Who writes it

Exactly one module writes the file, `engine/lockfile.mjs`, and every writer routes through it:
the vendor writer after it converges the tree, the install flow after it vendors a new pack, the
pack and engine update flows after they stamp. Nothing under `packs/` composes the JSON.

The settings file is never rewritten by any of those flows. A converge that changes what is
installed produces a one-file diff in the lock, beside the tree it describes, and the pull
request reads as a dependency bump: the versions that moved and the digests that moved with them.

## 4. Invariants

- **Intent and fact never share a file.** A field the engine derives is never in the settings
  file, and a field a person decides is never in the lock.
- **The lock describes the committed tree, not a fetch.** Claudinite vendors and commits the
  corpus; the digests exist to verify and to short-circuit, not to download.
- **A missing lock on a mounted tree is a state of its own.** It reads as "installed at unknown
  versions", never as version zero: an install flow that saw version zero would re-stamp latest
  while running none of the records between (basics' *Handling a value that can be unknown*).
- **A lock the engine cannot read fails the run.** An unknown `lockfileVersion` or a malformed
  file halts, loudly, rather than degrading to fewer checks (the local rule on a stale member
  declaration).

## 5. What the settings file stops carrying

`engineVersion` and each pack entry's `version` are read out of the settings file by a migration
record that writes the first lock and deletes them. Until every member has converged through that
record, `installedVersions` still falls back to the settings-file fields, and the
`legacy-shape-in-use` advisory reports a member that still carries them; the fallback comes out
one convergence window after that advisory ships.

## 6. Alternatives and their drawbacks

- **Keep the versions in the settings file** (today's shape). The machine rewrites a
  person-edited file nightly, so every human edit to `config` or `accept` races a converge for the
  same lines; and the file has no place for a digest or a `requires` closure, so an installed
  pack nobody named is versioned only by accident of which flow stamped it.
- **Two lock files, versions and digests apart** (Go's `go.mod` plus `go.sum`). Go splits them
  because the module file is hand-edited and the sum file is not; here the hand-edited file is
  the manifest, so the split lands on the boundary this design already draws and buys a second
  generated file for nothing.
- **A digest of the vendored tree, no per-pack rows** (a single `treeDigest`). Cheaper, but a
  mismatch then says only "something changed", and the converge cannot short-circuit one pack
  while another moved.
- **Resolved download locations per entry** (npm's `resolved`, Cargo's `source`). Every entry
  comes from the one canon at the one `sha`, so per-entry sources would be one value repeated.
  `canon` records it once; the day a second source exists the row gains a `source` field under a
  new `lockfileVersion`.
- **YAML** (pnpm, Yarn). Readable, but the engine is dependency-free and a JSON lock is what the
  self-test and the API readers already parse.
- **Naming it `lock.GENERATED.json`.** The `GENERATED` marker is this repository's convention for
  a file a tool regenerates, and it is what the generated-files guard keys on. A lockfile is
  recognisable by its bare name in every ecosystem, so the guard names this path explicitly
  instead.
