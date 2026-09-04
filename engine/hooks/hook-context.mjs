// What every guarding hook reads before it can judge anything: the project's
// declared packs and rule overrides, the active pack objects, and the session
// transcript. One reader, so the PreToolUse, UserPromptSubmit and PostToolUse
// commands cannot disagree about which packs are active or which skills the
// session has loaded.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEntries, skillLoads } from '../checks/helpers/session-transcript.mjs';
import { settingsPath } from '../settings-file.mjs';

// This module lives at <corpus>/engine/hooks/ — the same root the mount hook
// resolves the registry from, so the canon runs it from its own tree.
export const corpusRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// The raw settings: the declared packs (what activates) and the per-rule
// overrides (off / advisory / blocking), project-wide and per pack entry.
export function readSettings(projectRoot) {
  const path = settingsPath(projectRoot);
  if (!existsSync(path)) return { packs: [], rules: {} };
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const rules = { ...(raw.rules ?? {}) };
  for (const entry of Array.isArray(raw.packs) ? raw.packs : []) {
    if (entry && typeof entry === 'object') Object.assign(rules, entry.rules ?? {});
  }
  return { packs: Array.isArray(raw.packs) ? raw.packs : [], rules };
}

export async function activePacks(projectRoot, declared) {
  const { loadPacks, isActive } = await import(join(corpusRoot, 'engine', 'pack_loader', 'pack-registry.mjs'));
  const packs = await loadPacks({ localRoot: projectRoot });
  return packs.filter((p) => isActive(p, { packs: declared }));
}

export function transcriptEntries(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  try { return parseEntries(readFileSync(transcriptPath, 'utf8')); } catch { return []; }
}

export const loadedSkills = (transcriptPath) => skillLoads(transcriptEntries(transcriptPath));

// The one sentence every trigger's block or nudge ends with: how to load the
// skill. Reading the skill's own file is a load too (the transcript reader
// counts it), so the message carries that path beside the Skill call.
export function loadInstruction(missing, projectRoot) {
  const rel = (d) => join(d.dir, 'SKILL.md').replace(`${projectRoot}/`, '').split('\\').join('/');
  return `Skill tool, ${missing.map((d) => `skill: "${d.skill}"`).join(', ')}, or Read ${missing.map(rel).join(' or ')}`;
}
