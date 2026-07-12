#!/usr/bin/env node
// Perform any declared legacy -> canonical file renames in a checkout — the
// write side of "prefer Y, fall back to X, and rename X -> Y". For each active
// migration, if a legacy path still exists and its canonical does not, move it.
// Idempotent: a no-op once every rename has been applied. Dependency-free.
//
// Runs against a local checkout (a session, CI, or a future SessionStart
// self-heal hook wired via bootstrap). The fleet re-bootstrap performs the same
// renames over the GitHub API through bootstrap.md's own steps; the census then
// confirms completion (0 repos on the legacy shape) and retires the migration.
import { existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadMigrations, applyFileAliases } from './registry.mjs';

async function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const migrations = await loadMigrations();
  const exists = (p) => existsSync(join(root, p));
  const move = (from, to) => {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    renameSync(join(root, from), join(root, to));
  };
  const moved = [];
  for (const m of migrations) moved.push(...(await applyFileAliases(m, { exists, move })));
  if (moved.length) console.log(`Applied migrations:\n${moved.map((x) => `  ${x}`).join('\n')}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`migrations apply failed: ${e.message}`); process.exit(1); });
}
