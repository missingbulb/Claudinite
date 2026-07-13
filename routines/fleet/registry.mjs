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
// skills.
export function assembleForRepo(activePacks, allPackTasks) {
  const active = new Set(activePacks);
  return allPackTasks.filter((t) => active.has(t.pack));
}
