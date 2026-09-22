#!/usr/bin/env node
// SessionStart step: state, in one line, WHAT ACTUALLY LOADED this session —
// which repo, the active packs, the token weight of the prose injected, the guards
// and checks they arm, the skills mounted (the ones the hooks load on their own
// apart from the rest) and what their descriptions cost per skill beside the skills
// that came from outside the corpus, plus whatever facet an active pack contributes
// about itself. Its stdout becomes session context, and it carries the directive that
// makes the session open with the line, so the person in front of it sees the
// load stated back rather than having to trust that it happened.
//
// WHY IT IS NOT THE ORCHESTRATOR'S FOOTER. That footer reports the MACHINERY:
// which steps ran and which crashed. This reports the VOLUME: how much guidance
// is in the window and how much of it is armed as checks. The two answer
// different questions and neither substitutes for the other — a session where
// every step ran and nothing was declared looks identical from the footer alone.
//
// RUNS LAST, after the steps whose work it counts (the skill mount), so it describes
// the session that exists rather than the one about to. The prose it weighs no longer
// arrives through this hook at all — it rides CLAUDE.md since #807 — but the weight is
// still this line's to state, because the cost lands in the same context window and a
// session that cannot see it has no way to notice the corpus growing.
//
// Core names no pack to get a pack-specific facet. A pack that has one states it
// on the FACET CHANNEL — a `CLAUDINITE-FACET:` line from its session-start step,
// collected by the step runner (engine/pack_loader/run-pack-session-start.mjs)
// into the file `CLAUDINITE_SESSION_FACETS` names — and this step appends what it
// finds there. The channel rides the step because the facts worth stating are the
// ones a pack had to COMPUTE: a static count is already in prose the reader has.
//
// Fails soft to silence, and exits 0 always — a non-zero exit makes Claude Code
// DISCARD the orchestrator's whole stdout, including the steps that did work.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingsPath } from '../settings-file.mjs';

import { spawnSync } from 'node:child_process';
import { countWords, estimateTokens } from './token-estimate.mjs';

// The prose is reported in TOKENS because that is the unit of the cost it
// imposes — a context window, not a disk. The estimate goes through WORDS at the
// ratio token-estimate.mjs states. Rounded to the hundred and shown in thousands
// (`14.3k`), because a session summary is a sense of scale, not an accounting.
const TOKEN_ROUNDING = 100;
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const thousands = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// Where a session's OTHER skills come from: the person's own directory, which a
// marketplace nests its own tree inside. Read for one reason — a per-skill figure for
// the corpus's descriptions means nothing without a second one beside it, and this is
// the only comparable set a session can actually see. Nothing here is ever written.
const OUTSIDE_SKILLS_DEPTH = 4;
function outsideSkillDescriptions(home) {
  const root = join(home, '.claude', 'skills');
  const found = [];
  const walk = (dir, depth) => {
    if (depth > OUTSIDE_SKILLS_DEPTH) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
      else if (entry.name === 'SKILL.md') found.push(dir);
    }
  };
  walk(root, 0);
  return found;
}

// Which repo this is, as `owner/repo`: the checkout's own origin remote, or the
// Actions environment naming it. Neither known is no facet — the line never guesses
// a name, and a directory name is not one.
function repoName(projectRoot) {
  const fromEnv = process.env.GITHUB_REPOSITORY;
  const git = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: projectRoot, encoding: 'utf8' });
  const url = git.status === 0 ? git.stdout.trim() : '';
  const m = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (m) return `${m[1]}/${m[2]}`;
  return typeof fromEnv === 'string' && fromEnv.includes('/') ? fromEnv : null;
}

try {
  const loaderDir = dirname(fileURLToPath(import.meta.url)); // <corpus>/engine/pack_loader
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let declared = [];
  const configPath = settingsPath(projectRoot);
  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    if (Array.isArray(raw.packs)) declared = raw.packs;
  }

  const { loadPacks, isActive, bundledSkillSources } = await import(join(loaderDir, 'pack-registry.mjs'));
  const packs = await loadPacks({ localRoot: projectRoot, session: true });
  // A pack COPIED for the person in this session is left out of every count here. What it
  // loaded is already stated, by the step that copied it, on the facet channel this line
  // folds in - counting it again would state one set of rules twice, under two names.
  const active = packs.filter((pack) => isActive(pack, { packs: declared }) && !pack.temp);
  // Nothing active means this repo runs no Claudinite. Nothing loaded, so there
  // is nothing to state — the same silence the prose injector keeps.
  if (!active.length) process.exit(0);

  // The prose the injector actually emits: each active pack's own file, resolved
  // off the pack's directory, trimmed the way the injector trims it. The routing
  // table and the directory pointer are the injector's framing rather than a
  // pack's rules, so they are not counted here.
  const wordsByPack = new Map();
  for (const pack of active) {
    if (!pack.prose) continue;
    const prosePath = join(pack.dir, pack.prose);
    if (!existsSync(prosePath)) continue;
    try {
      const words = countWords(readFileSync(prosePath, 'utf8'));
      wordsByPack.set(pack.id, (wordsByPack.get(pack.id) ?? 0) + words);
    } catch { /* an unreadable file counts as none */ }
  }
  const proseWords = [...wordsByPack.values()].reduce((n, w) => n + w, 0);
  const tokens = estimateTokens(proseWords, TOKEN_ROUNDING);

  // What the active packs arm, split by WHEN it judges: a GUARD is a `scope: "action"`
  // declaration (`guardToolCalls`), judged per tool call by the PreToolUse hook; every
  // other rule — coded or declared, the pack's own or a skill's — is a CODE CHECK that
  // check_the_world and check_the_work between them run against this repo.
  let guards = 0;
  let checks = 0;
  for (const pack of active) {
    for (const rule of [...(pack.rules ?? []), ...(pack.skillChecks ?? [])]) {
      if (rule?.spec?.scope === 'action') guards += 1;
      else checks += 1;
    }
  }

  // The mounted skills, split by HOW they load: an AUTO-TRIGGER skill carries a
  // `force-load-on-*` trigger, so a hook loads it deterministically at the moment it
  // names; a REGULAR skill is offered on its description and loaded on judgment.
  const { skillMetadata } = await import(join(loaderDir, 'skill-frontmatter.mjs'));
  let autoTrigger = 0;
  let regular = 0;
  // A description is in the window from the session's first token whether or not the
  // skill is ever loaded, so it is priced here beside the prose; a body is not, and is
  // not counted. The per-skill figure is what the line carries, because an aggregate
  // alone cannot say whether the corpus writes its descriptions lean or fat.
  let skillDescWords = 0;
  for (const dir of bundledSkillSources(active).values()) {
    const m = skillMetadata(dir);
    const triggers = m.forceLoadPaths.length + m.toolCallTriggers.length + m.promptTriggers.length + m.toolResultTriggers.length;
    if (triggers > 0) autoTrigger += 1;
    else regular += 1;
    skillDescWords += countWords(m.description);
  }
  const mountedSkills = autoTrigger + regular;

  const facets = [
    plural(active.length, 'pack'),
    `${thousands(tokens)} context tokens`,
    plural(guards, 'guard'),
    plural(checks, 'code check'),
    plural(autoTrigger, 'auto-trigger skill'),
    plural(regular, 'regular skill'),
  ];

  // Priced only where something was mounted: a zero here would read as "the skills cost
  // nothing" rather than "there are none", and the per-skill figure has no denominator.
  if (mountedSkills > 0) {
    const skillTokens = estimateTokens(skillDescWords);
    const outside = outsideSkillDescriptions(process.env.HOME || homedir());
    const outsideTokens = estimateTokens(outside.reduce((n, dir) => n + countWords(skillMetadata(dir).description), 0));
    // The comparison is reported, never acted on: what a session got from outside the
    // corpus is the person's own business and no pack here can trim it. Absent — a CI
    // runner, a fresh container — the corpus's own figure stands alone rather than
    // claiming a set nothing found costs nothing.
    const against = outside.length
      ? `; ${Math.round(outsideTokens / outside.length)} each for the ${plural(outside.length, 'skill')} from elsewhere`
      : '';
    facets.push(`${thousands(skillTokens)} skill-description tokens (${Math.round(skillTokens / mountedSkills)} each${against})`);
  }

  // Whatever the active packs' steps said about themselves, in the order the
  // runner ran them. Absent file, unreadable file, no channel at all: the engine
  // facets stand on their own.
  const facetsFile = process.env.CLAUDINITE_SESSION_FACETS;
  if (facetsFile && existsSync(facetsFile)) {
    try {
      for (const line of readFileSync(facetsFile, 'utf8').split('\n')) {
        if (line.trim()) facets.push(line.trim());
      }
    } catch { /* one unreadable channel is not the session's problem */ }
  }

  // The directive comes FIRST and the line it names comes last, quoted by the colon:
  // a reader picking the nearest line then picks the summary. Said the other way round,
  // with the summary above and a "repeat that line" below it, the nearest line is the
  // directive itself — and sessions duly opened their replies by reciting it.
  //
  // It also has to say that the reply CONTINUES. A directive naming only what a reply
  // opens with is satisfiable by a reply that is nothing but its opening, and a first
  // turn answering to two such directives — this one and the `Comment class:` line —
  // has ended right there, both obligations discharged and no work done.
  const repo = repoName(projectRoot);
  process.stdout.write(
    'SESSION-START SUMMARY — an instruction, not text to repeat. '
    + 'Open your first reply with exactly this line and nothing before it, '
    + 'then go on to answer the owner in the same turn. The line:\n\n'
    + `Loaded Claudinite${repo ? ` from repo ${repo}` : ''}: ${facets.join(', ')}.\n`,
  );
} catch {
  // fail soft — a broken summary must never block a session
}
