// The run_daily task registry. Every daily task is contributed by a pack — there
// is no fleet-core category, so a task is active exactly where its pack is
// declared, and there is no `scope` to carry.

// Each pack's optional `run_daily` array (parallel to rules/skills/env on pack.mjs).
// Carries `pack` so the per-repo assembly can filter by which packs a member declares.
export function packTasks(packs) {
  const out = [];
  for (const p of packs) {
    for (const t of p.run_daily ?? []) {
      out.push({ ...t, pack: p.id });
    }
  }
  return out;
}

// The daily tasks for one member: the run_daily tasks of the packs it declares in its
// .claudinite-checks.json — the same union-over-active-packs activation as checks and
// skills. `allPackTasks` are the CANON packs' tasks (read from the canon checkout);
// `localTasks` are the member's OWN local-pack tasks (read from the member repo, each
// already tagged with its pack id and carrying `workerRepo` so its worker doc is read
// from the member, not the canon). Both are gated the same way — a task runs exactly
// where its pack is declared — so a local pack's daily task activates by declaration
// just like a canon pack's.
export function assembleForRepo(activePacks, allPackTasks, localTasks = []) {
  const active = new Set(activePacks);
  return [...allPackTasks, ...localTasks].filter((t) => active.has(t.pack));
}
