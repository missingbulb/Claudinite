// Per-pack parameters moved from the top-level `packConfig` key onto each pack's
// `packs` entry as `config` (#278). The write side is bootstrap step 4d (the fold
// snippet baselining re-runs on every member), not this record — like the pack
// seeds, this record is the transition's TELEMETRY: legacyPresent reads a member's
// declaration and reports it still on the old shape while a top-level `packConfig`
// key remains.
//
// The read-side tolerance lives INLINE, not resolver-driven: loadConfig still
// accepts the key (CONFIG_KEYS) and overlays it under the entry view
// (engine/checks/helpers/repo-context.mjs), and the fleet census's config reader
// falls back to it. When the whole fleet is off the old shape, drop that
// tolerance in one deliberate change: bootstrap step 4d, 'packConfig' from
// CONFIG_KEYS + the overlay (a straggler then gets the blocking unknown-setting
// error, the settings-validity gate becoming the enforcement), and the census
// fallback — the record itself stays, as history.
export default {
  id: 'pack-entry-config',
  landed: '2026-07-13',
  summary: "per-pack parameters moved from the top-level packConfig key onto each pack's packs entry as config (one-time fold; key stays readable until retirement)",
  legacyPresent: async (exists, read) => {
    const raw = await read('.claudinite-checks.json');
    if (raw == null) return false; // no declaration to read — not a member, not held
    try {
      const parsed = JSON.parse(raw);
      return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'packConfig' in parsed;
    } catch {
      return false; // unparsable — not held
    }
  },
};
