// The sheepdog pack's fleet CONFIG reader — the one parser for the enforcer repo's
// `sheepdog` pack entry.
//
// It lives at the pack root, not inside a task, because BOTH sweeps read the same
// entry: the census (tasks/fleet-census/) needs `owner` and `exclude`, the freshness
// sweep (tasks/fleet-freshness/) needs those plus `canonRepo` and `staleDays`. A
// second reader would be a second place for the owner/exclude semantics to drift —
// and this is what the file-placement skill calls lifting a shared dependency to the
// nearest common ancestor: distance 2 from each task instead of one task reaching
// into the other's folder.

// The sheepdog repo's .claudinite-checks.json carries, on its sheepdog pack entry:
//   { "id": "sheepdog", "config": { owner: "missingbulb", kind: "user", exclude: ["owner/repo", ...],
//                                   canonRepo: "missingbulb/Claudinite", staleDays: 14 } }
// owner is who to cover (default: the sheepdog repo's own owner); exclude is the repos
// deliberately kept out (a full owner/name each, lowercased). canonRepo and staleDays
// are the freshness sweep's two knobs and both default, so an existing config keeps
// working untouched. Callers read the home repo's file raw (fetched over the API, no
// engine on hand), so this resolves the entry itself — legacy top-level
// packConfig.sheepdog stays readable underneath until the `pack-entry-config` baseline
// migration retires (drop the fallback then). A missing config is an unreadable
// config: throw — absence is not consent to cover everything.
export function parseSheepdogConfig(cfg, home) {
  const entry = (Array.isArray(cfg?.packs) ? cfg.packs : []).find((e) => e?.id === 'sheepdog');
  const sd = entry?.config ?? cfg?.packConfig?.sheepdog;
  if (!sd || typeof sd !== 'object') {
    throw new Error(`the sheepdog repo ${home} declares no sheepdog config { owner, exclude } (on the pack entry or legacy packConfig.sheepdog) — nothing to cover`);
  }
  const owner = String(sd.owner ?? home.split('/')[0]).toLowerCase();
  const exclude = new Set((Array.isArray(sd.exclude) ? sd.exclude : []).map((s) => String(s).toLowerCase()));
  // Claudinite's own repo — what a member's stamped ref is measured against. Named
  // rather than inferred from the ref, because a ref tells you nothing about where
  // it came from; defaulted so no existing sheepdog config has to change.
  const canonRepo = String(sd.canonRepo ?? `${owner}/Claudinite`);
  // How far behind is too far. Not a hard number in code: a fleet whose members
  // legitimately go quiet for longer raises it rather than living with false alarms.
  const raw = Number(sd.staleDays);
  const staleDays = Number.isFinite(raw) && raw > 0 ? raw : 14;
  return { owner, exclude, canonRepo, staleDays };
}
