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
