#!/usr/bin/env node
// Claudinite conformance-check runner (see DESIGN.md). Dependency-free Node ≥18.
//   (default)   whole-repo sweep — milliseconds on a text corpus, sees cross-file breakage
//   --changed   transitional: scope to files changed vs the merge-base with main
//               (adopting a repo with a backlog only — not the enforcement default)
//   --base REF  override the base ref
//   --list      machine-readable rule catalog (id, severity, description, doc)
//   --init      write .claudinite-checks.json from the technology fingerprint
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildContext } from './lib/context.mjs';
import { applyConfig, render } from './lib/findings.mjs';
import { PACK_RULES, selectRules } from './packs/packs.mjs';
import { TECH_PACKS } from './packs/fingerprints.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const root = value('--root') || process.cwd();

if (has('--list')) {
  const rules = Object.values(PACK_RULES).flat();
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
  const packs = Object.entries(TECH_PACKS)
    .filter(([, spec]) => spec.available && spec.detect(ctx))
    .map(([name]) => name);
  writeFileSync(path, `${JSON.stringify({ packs, rules: {}, accept: [] }, null, 2)}\n`);
  console.log(`Wrote ${path} (packs: ${packs.length ? packs.join(', ') : 'none detected'}).`);
  process.exit(0);
}

const mode = has('--changed') ? 'changed' : 'all';
const ctx = buildContext({ root, mode, baseOverride: value('--base') });

let findings = [];
if (ctx.config.error) {
  findings.push({
    rule: 'config', severity: 'blocking', file: '.claudinite-checks.json', line: null,
    what: `unparsable: ${ctx.config.error}`, why: null,
    fix: 'fix the JSON — until then only default rule behavior applies', doc: 'checks/README.md',
  });
}
for (const rule of selectRules(ctx.config)) {
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
