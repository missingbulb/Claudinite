import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tasksDir = join(dirname(fileURLToPath(import.meta.url)), 'tasks');

// Fleet-core tasks: structural discovery of routines/fleet/tasks/<name>.mjs (any
// file except *.test.mjs), mirroring packs/ and migrations/ discovery — dropping a
// descriptor in registers it, no list to edit.
export async function loadFleetTasks() {
  const tasks = [];
  for (const f of readdirSync(tasksDir)
    .filter((n) => n.endsWith('.mjs') && !n.endsWith('.test.mjs'))
    .sort()) {
    tasks.push((await import(pathToFileURL(join(tasksDir, f)).href)).default);
  }
  return tasks;
}

// Pack tasks: each pack's optional `maintenance` array (parallel to rules/skills/env
// on pack.mjs). A pack task's scope is pack:<pack.id>, and it carries `pack` so the
// per-repo assembly can filter by which packs a member declares.
export function packTasks(packs) {
  const out = [];
  for (const p of packs) {
    for (const t of p.maintenance ?? []) {
      out.push({ ...t, scope: `pack:${p.id}`, pack: p.id });
    }
  }
  return out;
}

// The applicable task set for one member: every fleet-core task (always) plus the
// maintenance tasks contributed by the packs that member declares in its
// .claudinite-checks.json. This is the union-over-active-packs the design pins the
// sweep to — the same activation model as checks and skills.
export function assembleForRepo(activePacks, fleetTasks, allPackTasks) {
  const active = new Set(activePacks);
  return [...fleetTasks, ...allPackTasks.filter((t) => active.has(t.pack))];
}
