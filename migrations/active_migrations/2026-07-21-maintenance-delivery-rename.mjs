// Rename the maintenance.delivery values to describe the merge behavior, now that
// BOTH deliveries produce a PR (#374): `push`/`auto` -> `auto-merge` (the PR
// auto-merges once the repo's checks pass — named for exactly what it does, #385)
// and `pr` -> `review` (the PR waits for the owner). The old names were
// misnomers — `push` no longer pushes to the default branch, `pr` is ambiguous
// when both modes open a PR, and `auto` didn't say what is automatic.
//
// A literal value rewrite in `.claudinite-checks.json`, applied by the migration apply
// pass (registry.applyRewrites). The engine accepts `push`/`pr` as PERMANENT aliases
// for `auto`/`review` (fleet-apply's delivery read maps them; the baselining worker doc
// says the same), so — like local-pack-namespace's namespaced-id parser — the tolerance
// outlives the record and retiring this one strands nothing.
//
// legacyPresent: a member still stores the old `push`/`pr` value. retire: 'auto' —
// self-retires once the fleet has converged and stayed quiet a cycle.
export default {
  id: 'maintenance-delivery-rename',
  landed: '2026-07-21',
  summary: 'maintenance.delivery renamed push/auto->auto-merge, pr->review (rewrite; the engine keeps push/pr/auto as permanent aliases)',
  rewrite: [{
    file: '.claudinite-checks.json',
    replace: [
      { from: '"delivery": "push"', to: '"delivery": "auto-merge"' },
      { from: '"delivery": "auto"', to: '"delivery": "auto-merge"' },
      { from: '"delivery": "pr"', to: '"delivery": "review"' },
    ],
  }],
  legacyPresent: async (_exists, read) => {
    const raw = await read('.claudinite-checks.json');
    if (raw == null) return false;
    let delivery;
    try { delivery = JSON.parse(raw)?.maintenance?.delivery; } catch { return false; }
    return delivery === 'push' || delivery === 'pr' || delivery === 'auto';
  },
  retire: 'auto',
};
