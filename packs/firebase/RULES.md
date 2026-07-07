# Firebase

Portable practices for repos built on Firebase (Auth, Firestore, Cloud Functions, FCM). Earned in
missingbulb/ShoutsAndWhispers; keep product-specific schema in the consuming repo's docs.
Environment separation (dev/prod projects, App Check, store gating) lives in the opt-in
[firebase-release](../firebase-release/RULES.md) pack — declare it when shipping gets close.

## 1. Security rules are merge-aware and default-deny

- **End every ruleset with an explicit catch-all deny** and grant per collection; a collection
  nobody thought about must be unreachable, not accidentally open.
- **Write rules against merge semantics, not just creates.** Clients using `set(merge: true)`
  surface the **post-merge** document in `request.resource.data` — a key-presence check that is
  right for `create` silently breaks on `update`. For updates, validate
  `request.resource.data.diff(resource.data).affectedKeys()` (what the client actually touched);
  for creates, validate `keys()`. This asymmetry is the single most common way a correct-looking
  ruleset rejects every legitimate client write.
- **Guard every field dereference for absence.** Distinct writers legitimately upsert disjoint
  field subsets of one doc; an unguarded `d.field` on a missing key throws and denies. Pattern:
  `!('field' in d) || <validation>`.
- **Server-owned fields are absent from the client-allowed key list**, not "checked for equality"
  — with `diff().affectedKeys().hasOnly([...])` a client physically cannot touch them (rate-limit
  stamps, server-computed aggregates).
- **Pin client timestamps to `request.time`** (`FieldValue.serverTimestamp()` satisfies it) on any
  write whose freshness matters — a client must not forge a heartbeat time — but scope the pin to
  writes that touch those fields, or unrelated single-field merges get rejected.
- **Bound every client-writable string/blob** (length caps in rules); an unbounded field is a
  free storage channel.
- **Admin-SDK code bypasses rules** — a rules review must enumerate what *functions* write too;
  "rules allow it" and "the system writes it" are different lists.

## 2. Functions own identity, validation, and limits

- **Identity comes from the verified token, never the request body** (`request.auth`,
  `token.name`/`picture` claims). Anything the client sends about *who they are* is decoration.
- **Validate inputs at the boundary like an adversary wrote them**: type-check, range-check
  (`NaN`/`Infinity` slip through naive numeric checks), length-cap, and enum-check before any
  read or write; reject with typed `HttpsError`s (`invalid-argument`, `unauthenticated`,
  `resource-exhausted`) so clients can react specifically.
- **Rate limits need a transaction.** A read-check-write cooldown is bypassable by firing calls
  concurrently; run the read + check + stamp inside `runTransaction` so concurrent invocations
  serialize. A thrown `HttpsError` inside the transaction aborts it and propagates unchanged.
- **Chunk batched writes well under the 500-op limit** and treat multi-batch fan-out as
  at-least-once: a mid-sequence crash plus client retry duplicates the early batches. Document
  the idempotency-key escape hatch even if v1 doesn't implement it.
- **Push is best-effort by construction**: notification failures must never fail the triggering
  call; clean up dead tokens on the *actual* error codes
  (`messaging/registration-token-not-registered` — verify codes against the installed
  firebase-admin, not memory or old blog posts).

## 3. Test logic pure, rules empirically

- **Extract decision logic into pure modules** (audience selection, filtering, formatting) so the
  default suite runs with zero emulators and zero mocks of the Firebase SDK.
- **When rules themselves are under test, test them empirically** with
  `@firebase/rules-unit-testing` against the real emulator — simulate each *exact client write
  shape* the app performs (create vs merge-update vs single-field token write) plus each
  forbidden shape. Reading rules and believing them is how the merge-semantics bugs above ship.
- **Cross-language contracts get mirrored test vectors.** When client and server must compute the
  same derived value (a geohash, a normalization), commit identical input→output vectors in both
  suites and diff the literals in CI — "both use the standard algorithm" is not a proof.

## 4. Deploy layout and aliases

- **`firebase.json` at the repo root** with a `predeploy` build hook for functions
  (`npm --prefix functions run build`) so a deploy can never ship stale JS; keep compiled output
  (`functions/lib/`) and `.firebase/` gitignored.
- **Commit `.firebaserc` with named aliases and make the default the safe target** (see
  firebase-release for the full environment discipline). Deploy commands in docs always name
  what they deploy (`--only functions,firestore`) — an unqualified `firebase deploy` in a README
  eventually ships someone's half-finished hosting directory.
- **Functions engines pin the Node major** (`engines.node`) matching CI and local dev; a version
  skew between build and runtime surfaces as deploy-time module crashes, so smoke-load the built
  entrypoint (`node -e "require('./lib/index.js')"`) in the test lane.
