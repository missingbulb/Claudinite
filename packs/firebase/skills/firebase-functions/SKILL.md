---
name: firebase-functions
description: Writing Cloud Functions for Firebase — transactional rate limits, batched-write chunking and at-least-once fan-out, best-effort push with dead-token cleanup, smoke-loading the built entrypoint. Use when editing anything under functions/.
metadata:
  force-load-on-file-edits-paths:
    - "functions/**"
---

# Cloud Functions

## Limits and fan-out

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

## The built entrypoint

- **Smoke-load the built entrypoint in the test lane** (`node -e "require('./lib/index.js')"`).
  A Node-major skew between build and runtime, or a bad build, surfaces as a module crash the
  first time the deployed function is invoked. (6)
