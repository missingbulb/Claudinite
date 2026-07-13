import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packsDir = dirname(fileURLToPath(import.meta.url));

// Discover packs structurally: any packs/<name>/pack.mjs is a pack. No registry
// list to maintain — dropping a directory in adds it (the corpus's own
// "structural over hand-maintained list" rule, applied to the runner).
export async function loadPacks() {
  const packs = [];
  for (const name of readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()) {
    const manifest = join(packsDir, name, 'pack.mjs');
    if (existsSync(manifest)) packs.push((await import(pathToFileURL(manifest).href)).default);
  }
  return packs;
}

// A `packs` declaration entry is either a plain id string or an entry object
// `{ id, config?, rules?, accept?, via? }` carrying that pack's own settings
// (see checks/README.md). This is the one id-extractor every reader shares, so
// raw-JSON consumers (the SessionStart hooks, the fleet routines) and the
// engine agree on both shapes. Returns undefined for a malformed entry.
export const packEntryId = (entry) =>
  typeof entry === 'string'
    ? entry
    : entry !== null && typeof entry === 'object' && typeof entry.id === 'string'
      ? entry.id
      : undefined;

// No pack is active by default — basics included. Activation is exactly the
// project's declaration in .claudinite-checks.json (bootstrap seeds `basics`).
export const isActive = (pack, config) =>
  (config.packs ?? []).some((entry) => packEntryId(entry) === pack.id);

// Import closure. A pack can't be imported without the packs it requires: a
// release pack builds on its coding pack, a project-class pack on the framework
// pack that implements it. A pack names those in its `requires` list.
// Given the entries a project declares (id strings or entry objects), return
// that set plus every pack reachable through `requires` (transitively).
// Declared entries keep their order; each pack's pulled-in dependencies land
// right after it, deterministically. This runs when the declaration is
// WRITTEN — bootstrap's `--init` and the baselining backfill — so a pack's
// prerequisites are materialized into .claudinite-checks.json, visible and
// droppable like every other entry (the same reason `basics` is written
// explicitly rather than defaulted), never resolved implicitly at run time.
//
// Provenance: a materialized dependency is written as `{ id, via: [...] }`,
// `via` naming the resolved packs that directly require it — the file itself
// answers "why is this pack declared". An entry already carrying `via`
// self-identifies as materialized, so its `via` is recomputed to stay accurate
// as dependents come and go (an empty recomputed `via` marks an orphan the
// project can drop); a user-authored entry (no `via`) is kept verbatim.
// A declared id is kept verbatim even if unknown (settings validation flags
// that); a dependency is only materialized when it names a real pack; an
// entry with no usable id (a settings error) is preserved untouched — the
// writer must never drop what it can't interpret.
export function resolveDeclaredPacks(declared, packs) {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const declaredIds = new Set(declared.map(packEntryId).filter((id) => id !== undefined));
  const entryById = new Map();
  for (const entry of declared) {
    const id = packEntryId(entry);
    if (id !== undefined && !entryById.has(id)) entryById.set(id, entry);
  }
  const orderedIds = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    if (!declaredIds.has(id) && !byId.has(id)) return; // don't materialize a phantom dep
    seen.add(id);
    orderedIds.push(id);
    for (const dep of byId.get(id)?.requires ?? []) visit(dep);
  };
  for (const entry of declared) {
    const id = packEntryId(entry);
    if (id !== undefined) visit(id);
  }
  const via = (id) => orderedIds.filter((p) => byId.get(p)?.requires?.includes(id)).sort();
  const resolved = orderedIds.map((id) => {
    const entry = entryById.get(id);
    if (entry === undefined) return { id, via: via(id) };
    if (typeof entry === 'object' && 'via' in entry) return { ...entry, via: via(id) };
    return entry;
  });
  return [...resolved, ...declared.filter((entry) => packEntryId(entry) === undefined)];
}
