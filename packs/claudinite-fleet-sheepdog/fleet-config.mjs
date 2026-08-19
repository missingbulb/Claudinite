// The claudinite-fleet-sheepdog pack's fleet CONFIG reader — the one parser for the enforcer repo's
// `claudinite-fleet-sheepdog` pack entry.
//
// It lives at the pack root, not inside a task, because EVERY sweep reads the same
// entry: the roster sweep (tasks/fleet-roster/) needs `owner` and `exclude` for its
// coverage half plus `canonRepo` for its freshness half, and the
// pack-seed sweep (tasks/fleet-pack-seeds/) those plus `packSeeds`. A
// second reader would be a second place for the owner/exclude semantics to drift —
// and this is what the file-placement skill calls lifting a shared dependency to the
// nearest common ancestor: distance 2 from each task instead of one task reaching
// into the other's folder.

import { canonicalPackId } from '../../engine/pack_loader/renamed-packs.mjs';

// The enforcer repo's .claudinite-checks.json carries, on this pack's entry:
//   { "id": "claudinite-fleet-sheepdog", "config": { owner: "missingbulb", kind: "user", exclude: ["owner/repo", ...],
//                                   canonRepo: "missingbulb/Claudinite",
//                                   packSeeds: [{ id: "<a pack>", config: { ... } }] } }
// owner is who to cover (default: the enforcer repo's own owner); exclude is the repos
// deliberately kept out (a full owner/name each, lowercased). canonRepo is the
// freshness sweep's one knob and packSeeds the pack-seed sweep's one, and both
// default, so an existing config keeps working untouched. Callers read the
// home repo's file raw (fetched over the API, no
// engine on hand), so this resolves the entry itself — legacy top-level
// packConfig.sheepdog stays readable underneath until the `pack-entry-config` baseline
// migration retires (drop the fallback then). A missing config is an unreadable
// config: throw — absence is not consent to cover everything.
//
// BOTH SPELLINGS OF THE ID RESOLVE. The declaration this reads is the enforcer's own
// file as it stands on disk, which converges onto today's id on its own schedule; the
// legacy `packConfig` key is a member-written key that never converges at all. An
// enforcer whose declaration has not caught up must still cover its fleet, so the
// entry is matched through the engine's rename map and the old `packConfig` key is
// read as it was written.
export function parseSheepdogConfig(cfg, home) {
  const entry = (Array.isArray(cfg?.packs) ? cfg.packs : [])
    .find((e) => typeof e?.id === 'string' && canonicalPackId(e.id) === 'claudinite-fleet-sheepdog');
  const sd = entry?.config ?? cfg?.packConfig?.['claudinite-fleet-sheepdog'] ?? cfg?.packConfig?.sheepdog;
  if (!sd || typeof sd !== 'object') {
    throw new Error(`the fleet-enforcer repo ${home} declares no claudinite-fleet-sheepdog config { owner, exclude } (on the pack entry or legacy packConfig) — nothing to cover`);
  }
  const owner = String(sd.owner ?? home.split('/')[0]).toLowerCase();
  const exclude = new Set((Array.isArray(sd.exclude) ? sd.exclude : []).map((s) => String(s).toLowerCase()));
  // Claudinite's own repo — where the engine and pack versions a member is measured
  // against are read from, and what its stamped ref is checked to be on the trunk of.
  // Named rather than inferred from the ref, because a ref tells you nothing about
  // where it came from; defaulted so no existing claudinite-fleet-sheepdog config has to change.
  const canonRepo = String(sd.canonRepo ?? `${owner}/Claudinite`);
  // The pack declarations this fleet wants in every member — each `{ id, config? }`,
  // seeded by the pack-seed sweep. THE ENFORCER NAMES NO PACK: this list is the whole
  // vocabulary, supplied by the fleet that declares this pack, because the packs a
  // fleet standardizes on (and the parameters only the fleet knows — where its
  // people's files live, which repo holds something shared) are its business and not
  // this pack's. Absent or malformed is an empty list: a fleet asking its members to
  // declare nothing in particular is an ordinary fleet.
  const packSeeds = (Array.isArray(sd.packSeeds) ? sd.packSeeds : [])
    .filter((seed) => seed && typeof seed === 'object' && typeof seed.id === 'string' && seed.id.trim())
    .map((seed) => ({
      id: seed.id.trim(),
      ...(seed.config !== null && typeof seed.config === 'object' && !Array.isArray(seed.config) ? { config: seed.config } : {}),
    }));
  return { owner, exclude, canonRepo, packSeeds };
}
