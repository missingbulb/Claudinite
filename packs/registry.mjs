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

// No pack is active by default — basics included. Activation is exactly the
// project's declaration in .claudinite-checks.json (bootstrap seeds `basics`).
export const isActive = (pack, config) => config.packs.includes(pack.id);

// Import closure. A pack can't be imported without the packs it requires: a
// release pack builds on its coding pack (chrome-extension-release → chrome-
// extension), a class pack on the framework that implements it (spec-driven-
// product → executable-requirements). A pack names those in its `requires` list.
// Given the ids a project declares, return that set plus every pack reachable
// through `requires` (transitively). Declared ids keep their order; each pack's
// pulled-in dependencies land right after it, deterministically. This runs when
// the declaration is WRITTEN — bootstrap's `--init` and the baselining backfill —
// so a pack's prerequisites are materialized into .claudinite-checks.json,
// visible and droppable like every other entry (the same reason `basics` is
// written explicitly rather than defaulted), never resolved implicitly at run
// time. A declared id is kept verbatim even if unknown (settings validation
// flags that); a dependency is only materialized when it names a real pack.
export function resolveDeclaredPacks(declaredIds, packs) {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const declared = new Set(declaredIds);
  const out = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    if (!declared.has(id) && !byId.has(id)) return; // don't materialize a phantom dep
    seen.add(id);
    out.push(id);
    for (const dep of byId.get(id)?.requires ?? []) visit(dep);
  };
  for (const id of declaredIds) visit(id);
  return out;
}
