# `migrations-old/` — the aged-migration archive (canon-only)

Migration records that have passed their **TTL** (7 days since `landed`) are moved
here from [`active_migrations/`](../active_migrations/) by the `migrations-retire`
scheduler task (the TTL archiver).

Two things stay true after a record moves here, and one changes:

- **It still APPLIES.** `migrations/registry.mjs`'s `loadMigrations()` loads records
  from **both** folders, so a **dormant project** — one that fell behind and only now
  baselines — still gets an aged migration applied when baselining converges its mount
  out of a fresh canon clone. This is the whole point of keeping the record: backfill
  for the long tail.
- **It is NOT vendored.** The vendored consumer mount ships only `active_migrations/`
  (recent records). A project that is up to speed on migrations therefore carries
  few-to-none of these locally — it already applied them within the TTL window. This
  archive lives **only in the canon**, as the fallback source the baselining clone
  reads from.
- **Its check-tolerance ENDS.** `migrationActive()` scans only `active_migrations/`,
  so a migration's legacy-shape tolerance in the checks ends when it ages out here
  (every up-to-date repo converged within the TTL; a dormant one is converged by the
  apply pass *before* its checks run).

Records here are kept, not deleted — the archive is the durable backfill source. (The
legacy central routine's fleet-converged *deletion* pass never touches an archived
record; it is superseded by this TTL archiver.)
