---
name: firestore-security-rules
description: Writing and testing Firestore and Storage security rules. Use when editing firestore.rules or storage.rules, or reviewing what a ruleset allows.
metadata:
  body: guidelines
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - "**/firestore.rules"
    - "**/storage.rules"
---

# Firestore security rules

## Merge-aware and default-deny

- **End every ruleset with an explicit catch-all deny** and grant per collection; a collection
  nobody thought about must be unreachable, not accidentally open. (end-ruleset-explicit)

- **Write rules against merge semantics, not just creates.** Clients using `set(merge: true)`
  surface the **post-merge** document in `request.resource.data` — a key-presence check that is
  right for `create` silently breaks on `update`. For updates, validate
  `request.resource.data.diff(resource.data).affectedKeys()` (what the client actually touched);
  for creates, validate `keys()`. (write-rules-against)

- **Guard every field dereference for absence.** Distinct writers legitimately upsert disjoint
  field subsets of one doc; an unguarded `d.field` on a missing key throws and denies. Pattern:
  `!('field' in d) || <validation>`. (guard-field-dereference)

- **Server-owned fields are absent from the client-allowed key list**, not "checked for equality"
  — with `diff().affectedKeys().hasOnly([...])` a client physically cannot touch them (rate-limit
  stamps, server-computed aggregates). (server-owned-fields)

- **Pin client timestamps to `request.time`** (`FieldValue.serverTimestamp()` satisfies it) on any
  write whose freshness matters — but scope the pin to
  writes that touch those fields, or unrelated single-field merges get rejected.
  (pin-client-timestamps)

- **Bound every client-writable string/blob** (length caps in rules); an unbounded field is a
  free storage channel. (bound-client-writable)

## Test rules empirically

- **When rules themselves are under test, test them empirically** with
  `@firebase/rules-unit-testing` against the real emulator — simulate each *exact client write
  shape* the app performs (create vs merge-update vs single-field token write) plus each
  forbidden shape. (rules-themselves-test)
