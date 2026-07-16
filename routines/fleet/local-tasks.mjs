// Read a member repo's OWN local-pack run_daily tasks — the descriptors the canon
// checkout can't see because they live in the member's tree
// (.claudinite/local_packs/<pack>/run_daily/*.mjs), not the mounted canon. The
// planner assembles a repo's daily work from its declared packs' tasks; for a
// canon pack the descriptor is on disk in the canon checkout, for a LOCAL pack it
// must be fetched from the member and imported. This is the one adapter that does
// that, kept out of the pure planner (which just receives the resulting task list
// through its `localTasksFor` seam).
//
// ⚠️ EXPERIMENTAL — NOT ENABLED BY DEFAULT. Local packs' prose, checks, and skills
// are the proven, shipped path; running a member's own local-pack DAILY jobs on the
// fleet is not yet. The daily-run mechanism hasn't been exercised at the load and
// variety of arbitrary member-authored jobs, so the orchestrator does NOT wire this
// reader by default (buildWorkPlan's localTasksFor seam is left unset, so no local
// task is planned — see routines/auto-all-repos-maintenance.md). The code and its
// tests live here so the path is ready to enable deliberately once it's proven; a
// project's scheduled work stays a canon-pack run_daily or an out-of-repo routine
// until then.
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
// descriptor's `worker` is pack-relative and is rewritten to a member-repo-relative
// path here, with `workerRepo` set so the orchestrator reads it from the member.

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
  const packDirs = (await listDir(gh, fullName, '.claudinite/local_packs')).filter((e) => e.type === 'dir');
  for (const packEntry of packDirs) {
    const pack = packEntry.name;
    const runDaily = (await listDir(gh, fullName, `.claudinite/local_packs/${pack}/run_daily`))
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
          // pack-relative worker doc -> member-repo-relative path
          worker: descriptor.worker ? `.claudinite/local_packs/${pack}/${descriptor.worker}` : null,
        });
      } catch {
        // a broken descriptor is skipped — the member's other tasks still plan
      }
    }
  }
  return out;
}
