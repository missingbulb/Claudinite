#!/usr/bin/env node
// The CLAUDE.md channel: render `.claudinite/claude.GENERATED.md`, the file a
// repo's own CLAUDE.md imports and which in turn `@`-imports every active pack's
// prose.
//
// WHY THIS EXISTS AT ALL — #807. A SessionStart hook's contract is "stdout becomes
// session context", and that contract has no delivery receipt. Measured 2026-08-13:
// the orchestrator emitted 82,267 bytes, the harness delivered a ~2KB preview plus a
// path to a persisted file, and ~80KB of guidance never reached the model. Nothing
// on either side could tell. The pack corpus was 79,750 of those bytes — 97% of the
// payload — and the load-bearing directives sat *behind* it, so they were exactly
// what fell off the end.
//
// CLAUDE.md is the channel that does not have this failure. It is "loaded in full
// regardless of length" (the memory docs), delivered by the harness as a user message
// after the system prompt, and re-injected after `/compact`. Moving the corpus onto it
// costs the same tokens and loses none of them.
//
// THIS REVERSES #385, ON NEW EVIDENCE. A corpus-index `CLAUDE.md` with a consumer
// `@`-import existed and was retired by owner decision — vendoring/DESIGN.md recorded
// the replacement as "a session's rules arrive injected". #807 is the measurement that
// injection does not arrive. Two things differ from the retired shape, and both matter:
//   - The index lives BESIDE the mount (`.claudinite/claude.GENERATED.md`), not inside
//     it (`.claudinite/shared/CLAUDE.md`). The mount is one-directional and slated to
//     become a git submodule, which cannot carry a consumer's files; the index is the
//     consumer's, derived from the consumer's declaration.
//   - It is GENERATED, from the declaration, by the converge that already runs — so it
//     cannot drift from the packs a repo actually declares the way a hand-maintained
//     index did.
//
// TWO HARNESS FACTS THE FORMAT IS BUILT AROUND (memory docs):
//   - Relative `@` paths resolve against the file CONTAINING the import, not the cwd.
//     So the index's own directory (`.claudinite/`) is the origin for every path here,
//     which is why they are computed with `relative()` off it rather than off the root.
//   - Block-level HTML comments are STRIPPED before a memory file enters context. The
//     prose injector's `<!-- pack:<id> -->` attribution markers would simply vanish on
//     this channel, so attribution is carried by a visible bullet per pack instead —
//     and the maintainer banner is deliberately a comment, costing zero context while
//     staying visible to anything that opens the file with Read.
//
// Import depth is four hops; this uses two (CLAUDE.md → index → a pack's RULES.md).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPacks, isActive, PACK_DIRECTORY_FILE, SHARED_SUBDIR } from './pack-registry.mjs';

// The index, and the line a repo's CLAUDE.md carries to pull it in. One
// definition: the generator writes the first, the converge ensures the second,
// and the prose injector tests for both before it stays silent.
export const CLAUDE_INDEX_FILE = join('.claudinite', 'claude.GENERATED.md');
export const CLAUDE_INDEX_IMPORT = '@.claudinite/claude.GENERATED.md';

// `@` paths are POSIX in a memory file whatever the host separator is.
const posix = (p) => p.split(sep).join('/');

// The repo's declared pack list, read the way every other loader reads it. A
// missing or malformed settings file means nothing is declared, which is the same
// answer the prose injector gives.
function declaredPacks(projectRoot) {
  const configPath = join(projectRoot, '.claudinite-checks.json');
  if (!existsSync(configPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    return Array.isArray(raw.packs) ? raw.packs : [];
  } catch { return []; }
}

// Where the corpus sits IN THE REPO BEING WRITTEN FOR: the vendored mount when the
// repo has one, the repo root in the canon (which mounts nothing and runs its own
// live tree).
//
// This is not always the corpus the manifests were LOADED from, and the difference is
// the whole reason this function exists. `engine-update.mjs` converges a member out of
// a canon clone — it vendors into `<member>/.claudinite/shared/`, then calls
// convergeWiring with the member as `root` while the pack registry, which resolves
// `packs/` off its own module location, is still reporting the clone's directories.
// Writing `pack.dir` into the index there would emit `@`-imports traversing out to a
// checkout that only exists on the runner. The manifests are content-identical across
// the two (same commit, that being what vendoring means), so the ids are safe to
// re-root here — and the `existsSync` below is against the TARGET, so a pack whose
// files have not been vendored yet is skipped rather than imported as a dangling path.
export const corpusRootFor = (projectRoot) => (
  existsSync(join(projectRoot, SHARED_SUBDIR)) ? join(projectRoot, SHARED_SUBDIR) : projectRoot
);

// A pack's prose, as a path inside the repo being written for. A local pack was
// already discovered under that repo, so its own directory is right; a canon pack is
// re-rooted onto the target's corpus.
const prosePathIn = (pack, corpusRoot) => (
  pack.local ? join(pack.dir, pack.prose) : join(corpusRoot, 'packs', pack.id, pack.prose)
);

// Render the index from a resolved pack set. Split out from the disk-reading
// wrapper so the shape is testable against hand-built packs.
//
// Returns null when there is nothing to say — no active pack has prose and no
// pack states a routing boundary. A repo that runs no Claudinite gets no index
// rather than an empty heading, matching the injector's silence.
export function renderClaudeIndex(packs, active, { indexDir, projectRoot, corpusRoot, directoryPath }) {
  const imports = [];
  for (const pack of active) {
    if (!pack.prose) continue;
    const prosePath = prosePathIn(pack, corpusRoot);
    if (!existsSync(prosePath)) continue;
    // Relative to the INDEX, because that is what the harness resolves against.
    imports.push(`- **\`${pack.id}\`**${pack.local ? ' (local)' : ''} — @${posix(relative(indexDir, prosePath))}`);
  }

  // The same routing table the prose injector rendered, for every pack the repo
  // HOLDS rather than only the ones it declares: what a repo holds is already the set
  // a session can route content into, and the full catalog of what it could adopt is
  // the directory pointer below. Rows are capped at 20 words a side by the manifest
  // schema, so the table stays a cheap thing to carry.
  //
  // "Holds" is measured against the TARGET corpus for the same reason the imports are
  // (see above): converged from a canon clone, the loaded registry reports every canon
  // pack, so a table built from it would list packs the member never vendored — and,
  // worse, would differ from the table the member's own converge CLI renders, leaving
  // the two flows rewriting each other's index forever.
  const routed = packs
    .filter((p) => p.local || existsSync(join(corpusRoot, 'packs', p.id)))
    .filter((p) => p.ruleRoutingGuidance?.belongs && p.ruleRoutingGuidance?.excludes);
  const directoryPointer = directoryPath && existsSync(directoryPath)
    ? `\n\nThe packs listed are the ones this repo holds; the full directory of every pack it could adopt from Claudinite is \`${posix(relative(projectRoot, directoryPath))}\` — read it when weighing what to adopt.`
    : '';
  const routingTable = routed.length
    ? `# Claudinite — where content goes (pack routing)\n\nEach pack states what it owns and what it does not. When a rule, doc, skill or check could live in more than one, this table decides it — and "no pack fits" means a new pack or the project's own \`local/packs/\`, never the baseline by default.${directoryPointer}\n\n| Pack | Belongs | Does not belong |\n|---|---|---|\n${routed
      .map((p) => `| \`${p.id}\`${p.local ? ' (local)' : ''} | ${p.ruleRoutingGuidance.belongs} | ${p.ruleRoutingGuidance.excludes} |`)
      .join('\n')}\n`
    : '';

  if (!imports.length && !routingTable) return null;

  // A comment, not prose: stripped before this file enters context (so it costs
  // nothing every session) and still there for anyone who opens the file.
  const banner = '<!-- GENERATED — do not hand-edit. Rendered from this repo\'s pack declaration by\n'
    + '     Claudinite\'s engine/pack_loader/generate-claude-index.mjs, rewritten by every\n'
    + '     converge (the nightly update and any pack change). Edit a pack\'s RULES.md instead. -->';

  const guidance = imports.length
    ? '# Claudinite — active-pack guidance\n\n'
      + 'The baseline plus the packs this project declares, imported so their rules load with\n'
      + 'this file rather than through a hook\'s stdout (#807). Deeper per-pack reference (e.g. a\n'
      + 'pack\'s release doc) is linked from its prose and read on demand.\n\n'
      + `${imports.join('\n')}\n`
    : '';

  return `${banner}\n\n${[guidance, routingTable].filter(Boolean).join('\n---\n\n')}`;
}

// The index for a repo on disk: discover its packs (canon mount + its own local
// packs), keep the active ones, render. Returns null when the repo runs no
// Claudinite. Never throws — a caller in a hook or a converge treats a null as
// "nothing to write".
export async function claudeIndexContent(projectRoot) {
  try {
    const packs = await loadPacks({ localRoot: projectRoot });
    const declared = declaredPacks(projectRoot);
    const active = packs.filter((pack) => isActive(pack, { packs: declared }));
    if (!active.length) return null;
    const corpusRoot = corpusRootFor(projectRoot);
    return renderClaudeIndex(packs, active, {
      indexDir: join(projectRoot, dirname(CLAUDE_INDEX_FILE)),
      projectRoot,
      corpusRoot,
      directoryPath: join(corpusRoot, PACK_DIRECTORY_FILE),
    });
  } catch {
    return null; // fail soft — a broken loader must never block a session or a converge
  }
}

// Write the index if its content changed. Returns true when the file moved, so a
// converge can report it and a no-op converge stays a no-op. A repo with nothing
// to say leaves any existing file alone rather than truncating it — the packs may
// simply not have been vendored yet.
export async function writeClaudeIndex(projectRoot) {
  const content = await claudeIndexContent(projectRoot);
  if (content === null) return false;
  const path = join(projectRoot, CLAUDE_INDEX_FILE);
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

// CLI: `node generate-claude-index.mjs [--write] [root]` — print the index, or
// write it. The path a check or a session is told to run to regenerate by hand.
async function main() {
  const argv = process.argv.slice(2);
  const root = argv.find((a) => !a.startsWith('--')) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (argv.includes('--write')) {
    console.log(await writeClaudeIndex(root) ? `wrote ${CLAUDE_INDEX_FILE}` : `${CLAUDE_INDEX_FILE} already current`);
    return;
  }
  const content = await claudeIndexContent(root);
  if (content !== null) process.stdout.write(content);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
