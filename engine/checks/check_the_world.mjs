#!/usr/bin/env node
// World-scope conformance runner (see DESIGN.md): the rules that audit repo
// state as it exists now, plus the settings/interview diagnostics. Rules that
// judge the current change (`scope: 'work'`) run in check_the_work.mjs; the
// Stop hook and CI run both. Dependency-free Node ≥18.
//   (default)   whole-repo sweep — milliseconds on a text corpus, sees cross-file breakage
//   --changed   transitional: scope to files changed vs the merge-base with main
//               (adopting a repo with a backlog only — not the enforcement default)
//   --base REF  override the base ref
//   --list      machine-readable catalog of every rule, both scopes (id, severity, description, doc)
//   --init      write .claudinite-checks.json — basics plus the fingerprinted packs
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildContext, loadConfig } from './helpers/repo-context.mjs';
import { discoverPacks, resolveDeclaredPacks } from '../pack_loader/pack-registry.mjs';
import { runSweep, contributedRules, interviewState } from './sweep.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const root = value('--root') || process.cwd();

if (has('--list')) {
  const { packs } = await discoverPacks({ localRoot: root });
  const rules = [
    ...packs.flatMap((p) => p.rules ?? []),
    ...packs.flatMap((p) => p.skillChecks ?? []),
    ...packs.flatMap((p) => contributedRules(p, packs)),
  ];
  for (const r of rules.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`${r.id}\t${r.severity}\t${r.description}\t${r.doc}`);
  }
  process.exit(0);
}

if (has('--init')) {
  const path = join(root, '.claudinite-checks.json');
  if (existsSync(path)) {
    console.log(`${path} already exists — leaving it as-is.`);
    process.exit(0);
  }
  const { packs } = await discoverPacks({ localRoot: root });
  const ctx = buildContext({ root, mode: 'all' });
  // No pack is active by default, so the baseline is seeded as an explicit
  // declaration alongside the fingerprinted packs: every pack that flags
  // `seededByDefault` is written in (discovered structurally — the engine names
  // no pack), plus the ones a fingerprint detects. A seeded pack is still
  // opt-out-able where its own policy allows (baselining re-adds only the packs
  // whose absence it treats as drift), so removing a seeded declaration can
  // stick; each seeded pack ships its own one-time seed migration for the fleet.
  // Local packs are declared by hand, never fingerprinted or seeded — exclude
  // them from --init's seeding so a repo that already carries local packs (but
  // no config yet) doesn't auto-declare them.
  const seeded = packs.filter((p) => p.seededByDefault && !p.local).map((p) => p.id);
  const detected = [...seeded, ...packs.filter((p) => p.detect && !p.local && p.detect(ctx)).map((p) => p.id)];
  // A pack can't be imported without its dependencies — pull each declared pack's
  // `requires` closure into the declaration so it's complete and visible.
  const declared = resolveDeclaredPacks(detected, packs);
  // maintenance.delivery is deliberately materialized, not defaulted — the selection
  // must be visible in the file where a project would change it (see engine/checks/README.md).
  // Only what carries a decision: the declaration and the always-explicit
  // delivery. Empty rules/accept boilerplate is noise, not settings (#385);
  // loadConfig defaults absent keys.
  writeFileSync(path, `${JSON.stringify({ packs: declared, maintenance: { delivery: 'auto-merge' } }, null, 2)}\n`);
  console.log(`Wrote ${path} (packs: ${declared.join(', ')}).`);
  // Adoption interviews, strict at bootstrap: the flow that runs --init has the
  // owner present, so surface every declared pack's questions for the adoption
  // interview NOW (bootstrap.md Part 2). Outside bootstrap the same gap only
  // ever surfaces as a mild SessionStart note (the adoption skill's interview machinery).
  const { pending } = interviewState(packs, loadConfig(root));
  if (pending.length) {
    console.log('\nAdoption questions pending — interview the owner as part of this adoption: ask each'
      + ' question, record the answer verbatim on the pack\'s entry as answers.<question-id>, and'
      + ' derive the entry\'s config where the question\'s distill note says how.');
    for (const p of pending) for (const q of p.questions) console.log(`  ${p.packId} / ${q.id}: ${q.prompt}`);
  }
  process.exit(0);
}

const blocking = await runSweep({
  scope: 'world',
  root,
  mode: has('--changed') ? 'changed' : 'all',
  baseOverride: value('--base'),
});
process.exit(blocking ? 1 : 0);
