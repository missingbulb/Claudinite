// The one reader of this pack entry's config — what THIS canon's corpus is made of.
//
// A canon's shelf is `packs/`, because that is where the engine reads a canon's
// packs from; nothing about that is configurable and nothing here tries to make it
// so. What a canon can genuinely differ on is whether its corpus has a SECOND root
// beside the shelf — a top-level `skills/`, a `prompts/`, whatever that canon
// organizes its shared content into — and the promote stage's write surface is the
// one place that difference is load-bearing.
//
//   { "id": "claudinite-canon-curation", "config": { "write_paths": ["packs", "skills"] } }
//
// Unset is the ordinary case, not a misconfiguration: a canon whose corpus is its
// packs shelf and nothing else needs no entry at all.
import { canonicalPackId } from '../../engine/pack_loader/renamed-packs.mjs';
import { SETTINGS_FILES } from '../../engine/settings-file-names.mjs';

export const PACK_ID = 'claudinite-canon-curation';

// The canon shelf itself — always a corpus root, never removable by config, since a
// canon with no shelf is not a canon.
export const CANON_SHELF = 'packs';

// Every root a promoted lesson may land in, shelf first, each with its trailing
// slash so a prefix test cannot match a sibling file (`packsomething.md`).
export function corpusRoots(settingsText) {
  let parsed = null;
  try { parsed = JSON.parse(settingsText ?? ''); } catch { parsed = null; }
  const entry = (Array.isArray(parsed?.packs) ? parsed.packs : [])
    .find((e) => typeof e?.id === 'string' && canonicalPackId(e.id.replace(/^local\//, '')) === PACK_ID);
  const declared = entry?.config?.write_paths;
  const extra = (Array.isArray(declared) ? declared : [])
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => p.trim().replace(/^\.\//, '').replace(/\/+$/, ''));
  return [...new Set([CANON_SHELF, ...extra])].map((p) => `${p}/`);
}

// The settings file as it is named in this repo, read through whatever surface the
// caller has (a check context, a plain readFileSync). Both names resolve while the
// rename window is open.
export function readCorpusRoots(read) {
  for (const name of SETTINGS_FILES) {
    const text = read(name);
    if (text != null) return corpusRoots(text);
  }
  return corpusRoots(null);
}
