# Cloudflare Workers

Portable, project-agnostic practices for a backend built on Cloudflare Workers and its bound
storage primitives (D1, R2, Vectorize, Queues) and driven with Wrangler — true for any Worker
read cold. A default to adapt, not a contract.

- **A deploy replaces the schema before it replaces the code.** Wrangler applies pending D1
  migrations before it swaps in the new Worker, so for the length of the deploy the *previous*
  code is serving requests against the *new* schema. An additive change survives that window;
  anything else (a rename, a dropped column, a changed type) breaks the old code for as long as
  the deploy takes. Treat every schema change as three merges — expand, migrate the readers,
  contract — never one.

- **Choose the storage primitive by access pattern, not habit.** D1 for relational/queryable
  data; pair it with Vectorize for nearest-neighbour retrieval, since D1 has no vector type and
  Vectorize has no query language. KV has no queries at all — reach for it only for pure
  key-lookup. A Durable Object buys per-entity coordination; skip it when nothing needs
  finer-grained serialization than D1's own row writes already give you.

- **Hand-declare only the platform bindings you actually use, instead of depending on the
  published Workers types package, once a frontend shares the repo.** The published types pull in
  a large ambient global surface that collides with the DOM lib types a browser-facing package in
  the same repo needs (`Response`, `Request`, `crypto`, …), so both can't be `include`d at once.
  A small hand-written `env.ts` naming the handful of platform methods this Worker calls sidesteps
  the collision and keeps the Worker's real surface area visible in one place besides.

- **Test against the real `workerd` runtime, driven from the committed `wrangler.toml` unchanged
  — not a derived copy, not a mocked fetch handler.** The `wrangler` package exports a test
  harness (`createTestHarness` as of Wrangler 4) that boots a real local Worker from a config path
  and hands back its `fetch` and `scheduled` entry points, plus direct access to its bound D1/R2 —
  so a suite drives exactly what deploys, cron trigger included, rather than a hand-rolled
  approximation of it. Point the harness at the real config file, not a stripped or synthesized
  one: a derived copy is one more thing that can drift from what actually ships. If the config
  carries a cloud-backed binding not needed under test (Cloudflare's `[ai]`, or anything else that
  makes Wrangler open an authenticated proxy to Cloudflare and refuse to start without a token),
  keep it out of the harness's own config until the code under test genuinely needs it — its
  presence alone can turn a local, offline test run into one that requires live credentials.

- **Seed a test's D1 schema by executing the same migration files the deploy applies, never a
  schema hand-written for the test.** Read the project's own `migrations/*.sql` in order, split on
  `;`, strip `--` comments, and run each statement — a schema the test suite invented would prove
  nothing about the one that actually ships.

- **Local Wrangler dev/test does not prove Cloudflare's own D1/R2/Queues behave like their local
  emulation.** A suite that only ever runs against `wrangler`'s local runtime is honest proof that
  the code *asks* Cloudflare for the right thing, never proof that Cloudflare's real service
  *answers* it the same way. Follow every deploy with a small, separate smoke check against the
  real deployed origins (a handful of read-only probes, retried with backoff since a fresh deploy
  takes a moment to propagate) — it is the only lane that can catch a missing binding, an
  unapplied migration, or a Pages project serving the wrong directory.

- **When a startup script asks Wrangler "does this resource exist yet", tell *missing* apart from
  *unknown*.** A non-zero exit from a `wrangler` list/describe command means the question was
  never actually answered (a bad token, a network refusal, a CLI shape that moved) — reading that
  as "missing" sends someone to recreate a resource that is already there. Wrangler marks its own
  error severity with glyphs in its output (`✘` error, `▲` warning); match on that marker rather
  than line position, which just as often picks the version banner or the telemetry notice
  instead.
