import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// WHAT A PACK'S DIRECTORY ALREADY SAYS. Four of the manifest's fields were, in
// every pack ever written, a restatement of the tree they sit in: the id repeated
// the directory name, `badge` named the badge file beside it, `prose` named the
// RULES.md beside it, and `skills` listed the subdirectories of `skills/` — a list
// the spec then held to that same listing in both directions, so it could never
// legitimately differ. A field with exactly one correct value is not a
// declaration; it is a line every author copies and every reviewer skips.
//
// So the tree is read as the manifest's default layer and `pack.mjs` states only
// what the tree cannot: the pack's version, its routing guidance, its fingerprint,
// its rules. Discovery was already structural — a directory with a pack.mjs is a
// pack — and this is the same principle one level in.
//
// OVERRIDE, NOT REPLACEMENT. A manifest field still wins where it is declared, so
// a pack that genuinely differs says so: `prose: null` beside a RULES.md that is
// documentation rather than injected rules, a `skills` subset that withholds a
// directory from mounting. The merge is a plain spread — the conventions are the
// base object, the manifest the override — which means an explicitly declared
// `null` overrides too, and only an ABSENT field falls through to the tree.
//
// The one filesystem read in the manifest layer. `pack-schema.mjs` stays pure (the
// caller hands it the facts); this module is the caller's other half, so the two
// together are "read the tree, then judge the result".

// The conventional filenames. Named here rather than spelled at each use so the
// convention is one edit, and so a reader looking for "where does RULES.md become
// prose" lands on the answer.
export const PROSE_FILE = 'RULES.md';
export const BADGE_FILE = 'badge.svg';
export const SKILLS_DIR = 'skills';

// The skill directory names a pack bundles: every subdirectory of `<pack>/skills/`.
// A SKILL.md is NOT required here — a directory may carry only a skill's checks —
// because this answers "what does the pack bundle", and it is `bundledSkillSources`
// (the mount) that asks the narrower "what can a session load". Absent or
// unreadable skills/ reads as none; the registry's own scan reports the unreadable
// case, where it can name the fault.
export function bundledSkillDirs(packDir) {
  const root = join(packDir, SKILLS_DIR);
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
}

// What the pack directory named `name` says about itself. `badge` and `prose` are
// omitted rather than nulled when their file is absent, so a pack that declares
// neither and carries neither ends up with the fields simply not present — which
// is what every reader already treats as "no badge" / "no prose".
export function packConventions(packDir, name) {
  const conventions = { id: name, skills: bundledSkillDirs(packDir) };
  if (existsSync(join(packDir, PROSE_FILE))) conventions.prose = PROSE_FILE;
  if (existsSync(join(packDir, BADGE_FILE))) conventions.badge = BADGE_FILE;
  return conventions;
}

// The manifest as the loader consumes it: the tree's answer, overridden by
// whatever the manifest actually declares. A non-object export is handed back
// untouched — the spec is what reports that, and inventing an object here would
// turn a broken pack into a plausible one.
export function applyPackConventions(mod, packDir, name) {
  if (mod === null || typeof mod !== 'object' || Array.isArray(mod)) return mod;
  return { ...packConventions(packDir, name), ...mod };
}
