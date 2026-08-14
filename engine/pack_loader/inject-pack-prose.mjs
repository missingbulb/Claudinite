#!/usr/bin/env node
// SessionStart hook: emit the prose of every declared pack (basics included)
// so the baseline and the project's technology guidance load once per session —
// the eager, reliable replacement for hoping a soft-pointer read fires. Its
// stdout becomes session context. Fails soft (emits nothing) on any error.
// Registered per-repo — see bootstrap.md.
//
// NOW THE FALLBACK, NOT THE PRIMARY CHANNEL (#807). Measured 2026-08-13: this step
// alone emitted 79,750 of the orchestrator's 82,267 bytes, the harness delivered a
// ~2KB preview plus a path to a persisted file, and the guidance never reached the
// model — silently, because a SessionStart hook gets no delivery receipt. The corpus
// now rides `.claudinite/claude.GENERATED.md`, imported by the repo's CLAUDE.md, which
// the harness loads in full and re-injects after `/compact`
// (engine/pack_loader/generate-claude-index.mjs).
//
// So this step's job is no longer "emit the corpus" but "emit it WHEN THE OTHER
// CHANNEL DEMONSTRABLY IS NOT CARRYING IT". It verifies rather than assumes: the
// import line must be in CLAUDE.md, and the index on disk must equal what the current
// declaration renders. A member mid-converge, a repo whose CLAUDE.md was hand-edited,
// a pack declared since the last nightly — each fails that test and gets the full
// prose injected exactly as before. There is no window in which a session runs with
// neither channel, which is the property worth having: the failure this replaces was
// invisible, and a duplicated corpus is merely expensive.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeIndexContent, CLAUDE_INDEX_FILE, CLAUDE_INDEX_IMPORT } from './generate-claude-index.mjs';

// Is the CLAUDE.md channel actually carrying the corpus for this repo? Both halves
// must hold, and the second is an exact content match rather than a mere existence
// check: a stale index is a live repo loading last week's declaration, which reads
// identically to a healthy one from here.
//
// The import must be matched OUTSIDE code spans — the harness skips `@` mentions
// inside backticks, so a CLAUDE.md that only *documents* the line in backticks is one
// the harness never follows, and treating that as wiring would be the silent failure
// again in a new place.
async function claudeChannelCarriesCorpus(projectRoot) {
  const claudeMd = join(projectRoot, 'CLAUDE.md');
  if (!existsSync(claudeMd)) return false;
  const importPresent = readFileSync(claudeMd, 'utf8')
    .split('\n')
    .some((line) => !/`/.test(line) && line.includes(CLAUDE_INDEX_IMPORT));
  if (!importPresent) return false;
  const indexPath = join(projectRoot, CLAUDE_INDEX_FILE);
  if (!existsSync(indexPath)) return false;
  const expected = await claudeIndexContent(projectRoot);
  return expected !== null && readFileSync(indexPath, 'utf8') === expected;
}

try {
  const loaderDir = dirname(fileURLToPath(import.meta.url)); // <canon>/engine/pack_loader
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let declared = [];
  const configPath = join(projectRoot, '.claudinite-checks.json');
  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    if (Array.isArray(raw.packs)) declared = raw.packs;
  }

  const { loadPacks, isActive, PACK_DIRECTORY_FILE } = await import(join(loaderDir, 'pack-registry.mjs'));
  // Include the project's own local packs (.claudinite/local_packs/) alongside
  // the canon: their prose loads the same way, so a project's rules ride the pack
  // system rather than an explicit @import.
  const packs = await loadPacks({ localRoot: projectRoot });

  // Nothing active means this repo runs no Claudinite: no prose, and no routing
  // table either. The hook stays silent rather than pushing a catalog of the
  // corpus into a session that declared none of it.
  const active = packs.filter((pack) => isActive(pack, { packs: declared }));
  if (!active.length) process.exit(0);

  // The other channel has it, verifiably. Say so in one line rather than nothing at
  // all: a session that can see WHERE its rules came from can check them, and the
  // step's silence would otherwise be indistinguishable from the step failing.
  if (await claudeChannelCarriesCorpus(projectRoot)) {
    process.stdout.write(
      `Claudinite pack guidance loads from \`${CLAUDE_INDEX_FILE}\` via this repo's CLAUDE.md, not from this hook (#807).\n`,
    );
    process.exit(0);
  }

  const sections = [];
  for (const pack of active) {
    if (!pack.prose) continue;
    // Resolve prose off the pack's OWN directory (canon or local_packs), not a
    // single shared root — so a local pack's RULES.md is found where it lives.
    const prosePath = join(pack.dir, pack.prose);
    if (!existsSync(prosePath)) continue;
    sections.push(`<!-- pack:${pack.id} -->\n${readFileSync(prosePath, 'utf8').trim()}`);
  }

  // The routing table: every pack's own statement of its boundary, so a session
  // holding a piece of content (a doc, a rule, a skill) routes it to the pack
  // that owns it instead of defaulting into the baseline. Emitted for every pack
  // DISCOVERED, not only the active ones — a consumer holds just the packs it
  // vendored, so the discovered set is already the set it can route into, and in
  // the canon every pack is a legitimate destination whether or not this repo
  // declares it. Rows are short by contract (the manifest spec caps each side at
  // 20 words — pack-schema.mjs), so the whole table stays a cheap session cost.
  const routed = packs.filter((p) => p.ruleRoutingGuidance?.belongs && p.ruleRoutingGuidance?.excludes);
  // The full pack directory: the vendored catalog of EVERY canon pack, not just
  // the ones this repo holds — pointed at (never inlined; it is read on demand)
  // so a session weighing "what could this repo adopt?" finds the answer. The
  // loader's grandparent is the canon root on both mounts (.claudinite/shared/
  // in a consumer, the repo root at home); an older mount without the file gets
  // no pointer rather than a dangling path.
  const directoryPath = join(dirname(dirname(loaderDir)), PACK_DIRECTORY_FILE);
  const directoryPointer = existsSync(directoryPath)
    ? `\n\nThe packs listed are the ones this repo holds; the full directory of every pack it could adopt from Claudinite is \`${relative(projectRoot, directoryPath)}\` — read it when weighing what to adopt.`
    : '';
  const routingTable = routed.length
    ? `# Claudinite — where content goes (pack routing)\n\nEach pack states what it owns and what it does not. When a rule, doc, skill or check could live in more than one, this table decides it — and "no pack fits" means a new pack or the project's own \`local_packs/\`, never the baseline by default.${directoryPointer}\n\n| Pack | Belongs | Does not belong |\n|---|---|---|\n${routed
        .map((p) => `| \`${p.id}\`${p.local ? ' (local)' : ''} | ${p.ruleRoutingGuidance.belongs} | ${p.ruleRoutingGuidance.excludes} |`)
        .join('\n')}\n`
    : '';

  if (sections.length || routingTable) {
    const guidance = sections.length
      ? `# Claudinite — active-pack guidance\n\nThe baseline plus the packs this project declares. Deeper per-pack reference (e.g. a pack's release doc) is linked from its prose and read on demand.\n\n${sections.join('\n\n---\n\n')}\n`
      : '';
    // FIRST, deliberately. Everything after this line is what #807 showed can be
    // truncated away without a trace; this line is the one that says the fallback is
    // running at all, so it goes where a truncated delivery still keeps it.
    const notice = `NOTE: this repo's CLAUDE.md is not carrying the Claudinite pack index, so the corpus below is being injected through the SessionStart hook — a channel that truncates large payloads silently (#807). Converge the repo, or run \`node <corpus>/engine/pack_loader/generate-claude-index.mjs --write\` and import \`${CLAUDE_INDEX_FILE}\` from CLAUDE.md.\n\n`;
    process.stdout.write(notice + [guidance, routingTable].filter(Boolean).join('\n---\n\n'));
  }
} catch {
  // fail soft — a broken loader must never block a session
}
