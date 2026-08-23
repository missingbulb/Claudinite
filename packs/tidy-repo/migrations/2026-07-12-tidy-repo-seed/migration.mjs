// One-time seed of the tidy-repo pack into the EXISTING fleet's declarations. New
// repos get tidy-repo from `bootstrap --init`; this migration catches repos
// bootstrapped before the pack existed, so today's universal tidy doesn't regress.
//
// Unlike a path-relocation migration, the "legacy shape" here lives inside a file —
// a member whose .claudinite-checks.json declares no tidy-repo — so legacyPresent
// READS the declaration (callers pass a content `read` alongside `exists`;
// path-only migrations ignore the extra arg).
//
// While this migration is recent (bootstrap.md), baselining seeds tidy-repo into any
// member that lacks it. Once the record ages out of the vendoring window the seeding
// ends with it, so a later removal by an owner is durable — nothing re-adds the pack.
export default {
  id: 'tidy-repo-seed',
  landed: '2026-07-12',
  version: 1,
  summary: "seed the tidy-repo pack into existing members' declarations (one-time; not backfilled after)",
  legacyPresent: async (exists, read) => {
    const raw = (await read('.claudinite-settings.json')) ?? await read('.claudinite-checks.json');
    if (raw == null) return false; // no declaration to read — not a member, not held
    try {
      const { packs } = JSON.parse(raw);
      // Entries are id strings or { id, ... } objects — compare by id.
      return Array.isArray(packs) && !packs.some((e) => (typeof e === 'string' ? e : e?.id) === 'tidy-repo');
    } catch {
      return false; // unparsable — not held
    }
  },
};
