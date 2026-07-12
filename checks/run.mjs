#!/usr/bin/env node
// Claudinite conformance-check runner (see DESIGN.md). Dependency-free Node ≥18.
//   (default)   whole-repo sweep — milliseconds on a text corpus, sees cross-file breakage
//   --changed   transitional: scope to files changed vs the merge-base with main
//               (adopting a repo with a backlog only — not the enforcement default)
//   --base REF  override the base ref
//   --list      machine-readable rule catalog (id, severity, description, doc)
//   --init      write .claudinite-checks.json — basics plus the fingerprinted packs
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildContext } from './lib/context.mjs';
import { applyConfig, render } from './lib/findings.mjs';
import { loadPacks, isActive } from '../packs/registry.mjs';
import { loadSkillRules } from '../skills/registry.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const root = value('--root') || process.cwd();

const packs = await loadPacks();
// Skills own the test-the-world checks that validate their action (co-located
// with the SKILL.md), discovered alongside the packs and always run.
const skillRules = await loadSkillRules();

if (has('--list')) {
  const rules = [...packs.flatMap((p) => p.rules), ...skillRules];
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
  const ctx = buildContext({ root, mode: 'all' });
  // No pack is active by default — basics included — so the baseline is
  // seeded as an explicit declaration alongside the fingerprinted packs.
  // basics, grow_with_claudinite, and tidy-repo are the seeded-by-default declared
  // packs; the rest come from fingerprint. grow_with_claudinite and tidy-repo are
  // default-on but opt-out-able: baselining never re-adds them (unlike basics), so
  // removing one from the declaration sticks (each has a one-time seed migration for
  // the existing fleet).
  const seeded = ['basics', 'grow_with_claudinite', 'tidy-repo'];
  const detected = [...seeded, ...packs.filter((p) => p.detect && p.detect(ctx)).map((p) => p.id)];
  // maintenance.delivery is deliberately materialized, not defaulted — the selection
  // must be visible in the file where a project would change it (see checks/README.md).
  writeFileSync(path, `${JSON.stringify({ packs: detected, rules: {}, accept: [], maintenance: { delivery: 'push' } }, null, 2)}\n`);
  console.log(`Wrote ${path} (packs: ${detected.join(', ')}).`);
  process.exit(0);
}

const mode = has('--changed') ? 'changed' : 'all';
const ctx = buildContext({ root, mode, baseOverride: value('--base') });
ctx.knownPacks = packs; // for pack-declaration's fingerprint drift check

let findings = [];
if (ctx.config.error) {
  findings.push({
    rule: 'config', severity: 'blocking', file: '.claudinite-checks.json', line: null,
    what: `unparsable: ${ctx.config.error}`, why: null,
    fix: 'fix the JSON — until then only default rule behavior applies', doc: 'checks/README.md',
  });
}
for (const pack of packs) {
  if (!isActive(pack, ctx.config)) continue;
  for (const rule of pack.rules) {
    if (ctx.config.rules[rule.id] === 'off') continue;
    findings.push(...rule.run(ctx));
  }
}
for (const rule of skillRules) {
  if (ctx.config.rules[rule.id] === 'off') continue;
  findings.push(...rule.run(ctx));
}
findings = applyConfig(findings, ctx.config);
findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'blocking' ? -1 : 1));

for (const f of findings) console.log(`${render(f)}\n`);
const blocking = findings.filter((f) => f.severity === 'blocking').length;
const advisory = findings.length - blocking;
if (findings.length) {
  console.log(`${blocking} blocking, ${advisory} advisory (scope: ${mode}${ctx.baseRef ? ` vs ${ctx.baseRef}` : ''}).`);
}
process.exit(blocking ? 1 : 0);
