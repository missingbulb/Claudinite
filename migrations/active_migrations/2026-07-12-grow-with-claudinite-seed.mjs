// One-time seed of the grow_with_claudinite pack into the EXISTING fleet's
// declarations. New repos get it from `bootstrap --init`; this catches repos
// bootstrapped before the pack existed, so the growth lifecycle keeps covering them.
// Same shape as tidy-repo-seed: legacyPresent READS the declaration (a member declares
// no grow_with_claudinite), the census passes it a content `read`; while live,
// baselining seeds it; the census auto-retires it once the fleet has converged, after
// which a removal is durable (baselining never re-adds it).
export default {
  id: 'grow-with-claudinite-seed',
  landed: '2026-07-12',
  summary: "seed grow_with_claudinite into existing members' declarations (one-time; not backfilled after)",
  legacyPresent: async (exists, read) => {
    const raw = await read('.claudinite-checks.json');
    if (raw == null) return false;
    try {
      const { packs } = JSON.parse(raw);
      // Entries are id strings or { id, ... } objects — compare by id.
      return Array.isArray(packs) && !packs.some((e) => (typeof e === 'string' ? e : e?.id) === 'grow_with_claudinite');
    } catch {
      return false;
    }
  },
  retire: 'auto',
};
