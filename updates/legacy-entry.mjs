// A LEGACY-PATH SHIM, deleted once no fielded worker names one (#1317).
//
// The update flows moved to packs/claudinite-lifecycle/updates/, and the modules beside
// this one re-export them from the paths a member still names. A member's vendored
// update worker resolves these by literal path against the canon tree it just fetched,
// and that worker is copied once and stale forever, so the old paths must keep
// resolving until no fielded copy names one.
//
// A COMMAND-LINE entry decides it is running as the program by comparing its own
// `import.meta.url` to `process.argv[1]`, which under a shim names the shim; rewriting
// the path here — before the re-export beneath the import of this module evaluates the
// target — is what keeps such an entry doing the run it did.
if (process.argv[1]?.includes('/updates/')) {
  process.argv[1] = process.argv[1].replace('/updates/', '/packs/claudinite-lifecycle/updates/');
}
