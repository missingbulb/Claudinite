// Read a member repo's OWN local-pack run_daily tasks — the descriptors the canon
// checkout can't see because they live in the member's tree
// (.claudinite/local_packs/<pack>/run_daily/*.mjs), not the mounted canon. The
// planner assembles a repo's daily work from its declared packs' tasks; for a
// canon pack the descriptor is on disk in the canon checkout, for a LOCAL pack it
// must be fetched from the member and imported. This is the one adapter that does
// that, kept out of the pure planner core — which wires it as the DEFAULT
// `localTasksFor` (plan.mjs), so a declared local pack's daily tasks plan exactly
// like a canon pack's, no seam wiring needed. Local-pack scheduling is a
// first-class path (the canon home's own curation tasks ride it nightly); a test
// injects a fake through the seam, and passing `localTasksFor: null` disables it.
//
// TRUST. A descriptor's `gate` is member-authored code that runs in the fleet
// session, exactly like a canon pack's gate — the difference is provenance only.
// That is safe under the fleet's single-owner model: every repo the routine
// maintains is the owner's own (the enrollment model), and the fleet already
// dispatches member-authored routine.md workers with full MCP write access; a gate
// is a strictly smaller surface (a read-only `gh` in, a `{run,targets,reason}`
// verdict out). It runs only over repos in the session's granted scope.
//
// SHAPE. A local pack's run_daily descriptor must be a SELF-CONTAINED module (a
// default-exported { id, worker, order, full_sweep_supported, smarts, gate } with
// no sibling imports) so it can be fetched and imported standalone — the planner
// imports each descriptor directly, never the pack.mjs that also lists it. The
// pack id is the pack's directory name (the canon convention, so the member's
// declaration — which names the id — gates it without a second fetch). The
// descriptor's `worker` is pack-relative — or repo-root-relative with a leading
// "/" (a worker doc living elsewhere in the member's own tree, e.g. a corpus
// skill doc in the canon home) — rewritten to a member-repo-relative path here,
// with `workerRepo` set so the orchestrator reads it from the member.

// Import a self-contained ES-module source string and return its default export.
// A data: URL needs no temp file or cleanup; a self-contained descriptor (no
// relative/bare imports) loads fine this way.
async function importSource(source) {
  const url = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  return (await import(url)).default;
}

// GitHub `get_file_contents` returns an array for a directory and a { content:
// base64 } object for a file; a missing path is a non-200. These helpers isolate
// that shape so the reader below reads listings and files uniformly.
async function listDir(gh, fullName, path) {
  const { status, json } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status !== 200 || !Array.isArray(json)) return [];
  return json;
}
async function readFile(gh, fullName, path) {
  const { status, json } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status !== 200 || !json?.content) return null;
  return Buffer.from(json.content, 'base64').toString('utf8');
}

/**
 * Every local-pack run_daily task a member declares, ready for the planner.
 * `importModule(source) -> descriptor` is injectable (tests pass a fake so the
 * pure planner test never imports real code); the default imports the fetched
 * source via a data: URL. Fail-soft per pack and per descriptor: a missing
 * local_packs dir, a pack with no run_daily, or one broken descriptor is skipped,
 * never sinking the repo's plan.
 */
export async function readLocalTasks(gh, fullName, { importModule = importSource } = {}) {
  const out = [];
  // Read BOTH local roots over the API — the canonical .claudinite/local/packs
  // and the pre-rename .claudinite/local_packs — so a member (the canon home
  // included) is found whichever layout it is on during the migration window. A
  // pack seen under the canonical root wins; the legacy root only contributes
  // packs not already found (first-seen by pack name).
  const seenPacks = new Set();
  for (const localRoot of ['.claudinite/local/packs', '.claudinite/local_packs']) {
    const packDirs = (await listDir(gh, fullName, localRoot)).filter((e) => e.type === 'dir');
    for (const packEntry of packDirs) {
      const pack = packEntry.name;
      if (seenPacks.has(pack)) continue;
      seenPacks.add(pack);
      const runDaily = (await listDir(gh, fullName, `${localRoot}/${pack}/run_daily`))
        .filter((e) => e.type === 'file' && e.name.endsWith('.mjs'));
      for (const fileEntry of runDaily) {
        try {
          const source = await readFile(gh, fullName, fileEntry.path);
          if (source == null) continue;
          const descriptor = await importModule(source);
          if (!descriptor || typeof descriptor.gate !== 'function' || typeof descriptor.id !== 'string') continue;
          out.push({
            ...descriptor,
            pack,
            workerRepo: fullName,
            // pack-relative worker doc -> member-repo-relative path (under the root
            // the pack was found in); a leading "/" opts out (repo-root-relative
            // already, just stripped)
            worker: !descriptor.worker ? null
              : descriptor.worker.startsWith('/') ? descriptor.worker.slice(1)
                : `${localRoot}/${pack}/${descriptor.worker}`,
          });
        } catch {
          // a broken descriptor is skipped — the member's other tasks still plan
        }
      }
    }
  }
  return out;
}
