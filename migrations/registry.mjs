import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Structural discovery, like packs/ and skills/: every migrations/<file>.mjs
// (except this registry and any *.test.mjs) is a migration spec. Each returned
// object carries its source `file` alongside the spec fields, so the census can
// name the file to delete when it retires.
export async function loadMigrations() {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && f !== 'registry.mjs' && !f.endsWith('.test.mjs'))
    .sort();
  const out = [];
  for (const f of files) {
    const spec = (await import(pathToFileURL(join(dir, f)).href)).default;
    out.push({ file: f, ...spec });
  }
  return out;
}

// Read side — "prefer Y, fall back to X": the ordered list of acceptable paths
// for a canonical target (canonical first, then its legacy aliases). A tolerance
// point consults this instead of hardcoding its own LEGACY_* constant, so a
// rename is declared once here and every reader picks it up. Unknown targets
// resolve to just themselves.
export function resolvePath(migrations, canonical) {
  for (const m of migrations) {
    for (const a of m.aliases ?? []) {
      if (a.canonical === canonical) return [a.canonical, ...(a.legacy ?? [])];
    }
  }
  return [canonical];
}

// Write side — "and rename X -> Y": for each alias whose legacy path still
// exists and whose canonical does not, move legacy -> canonical. `exists` and
// `move` are injected so the same logic drives a local checkout (sync fs) or a
// future API applier (async). Idempotent — a no-op once the rename is done.
export async function applyFileAliases(migration, { exists, move }) {
  const moved = [];
  for (const a of migration.aliases ?? []) {
    for (const legacy of a.legacy ?? []) {
      if ((await exists(legacy)) && !(await exists(a.canonical))) {
        await move(legacy, a.canonical);
        moved.push(`${legacy} -> ${a.canonical}`);
      }
    }
  }
  return moved;
}

// Retirement — the "smart, not overzealous" guard. A migration is retirable only
// when the whole fleet is proven done:
//   - the census classified EVERY repo (unknownCount === 0) — an API error must
//     not hide a repo still on the legacy shape;
//   - ZERO repos still carry its legacy shape (pending.get(id) === 0);
//   - it landed strictly before today (>= one nightly cycle, so at least one
//     baselining pass has had a chance to migrate everyone); and
//   - it opts into auto-retirement (retire !== 'manual'). A migration whose
//     tolerance still lives inline elsewhere sets retire:'manual' so deleting
//     this record alone can't strand that tolerance.
// YYYY-MM-DD dates compare lexicographically == chronologically.
export function retirableMigrations(migrations, { pending, unknownCount, today }) {
  if (unknownCount > 0) return [];
  return migrations.filter((m) => {
    if ((m.retire ?? 'auto') !== 'auto') return false;
    if ((pending.get(m.id) ?? 0) > 0) return false;
    return String(today) > String(m.landed);
  });
}
