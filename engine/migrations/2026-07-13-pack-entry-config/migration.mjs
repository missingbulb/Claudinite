// Per-pack parameters moved from the top-level `packConfig` key onto each pack's
// `packs` entry as `config` (#278). The write side is bootstrap step 4d (the fold
// snippet baselining re-runs on every member), not this record — like the pack
// seeds, this record is the transition's TELEMETRY: legacyPresent reads a member's
// declaration and reports it still on the old shape while a top-level `packConfig`
// key remains.
//
// The read-side tolerance is GONE (#1640): `loadConfig` no longer accepts the key
// or overlays it under the entry view (engine/checks/helpers/repo-context.mjs), so
// a straggler gets the blocking unknown-setting error and the settings-validity
// gate is the enforcement. The record stays, as history and as the telemetry that
// says who is still holding the old shape.
export default {
  id: 'pack-entry-config',
  landed: '2026-07-13',
  version: 1,
  summary: "per-pack parameters moved from the top-level packConfig key onto each pack's packs entry as config (one-time fold; the key stopped being read on #1640)",
  legacyPresent: async (exists, read) => {
    const raw = await read('.claudinite-settings.json');
    if (raw == null) return false; // no declaration to read — not a member, not held
    try {
      const parsed = JSON.parse(raw);
      return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'packConfig' in parsed;
    } catch {
      return false; // unparsable — not held
    }
  },
};
