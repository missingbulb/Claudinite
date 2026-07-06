#!/usr/bin/env node
// SessionStart hook: emit the prose of every active pack (universal + declared)
// so the baseline and the project's technology guidance load once per session —
// the eager, reliable replacement for hoping a soft-pointer read fires. Its
// stdout becomes session context. Fails soft (emits nothing) on any error.
// Registered per-repo — see bootstrap.md.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const packsDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let declared = [];
  const configPath = join(projectRoot, '.claudinite-checks.json');
  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    if (Array.isArray(raw.packs)) declared = raw.packs;
  }

  const { loadPacks, isActive } = await import(join(packsDir, 'registry.mjs'));
  const packs = await loadPacks();

  const sections = [];
  for (const pack of packs) {
    if (!pack.prose || !isActive(pack, { packs: declared })) continue;
    const prosePath = join(packsDir, pack.id, pack.prose);
    if (!existsSync(prosePath)) continue;
    sections.push(`<!-- pack:${pack.id} -->\n${readFileSync(prosePath, 'utf8').trim()}`);
  }

  if (sections.length) {
    process.stdout.write(
      `# Claudinite — active-pack guidance\n\nThe baseline plus the packs this project declares. Deeper per-pack reference (e.g. a pack's RELEASE.md) is linked from its prose and read on demand.\n\n${sections.join('\n\n---\n\n')}\n`
    );
  }
} catch {
  // fail soft — a broken loader must never block a session
}
