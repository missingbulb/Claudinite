import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';
import { ruleBlocks, readmeRuleIndex, SEVERITIES, REASONS } from './rule-index.mjs';

// A pack README's rule index states each prose rule's word count, the severity
// of ignoring it and the reason it exists. The word count is derived from
// RULES.md, and RULES.md is appended to several times a week — so it is held
// against the prose here rather than trusted to stay current on its own.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const packsWithProse = async () => {
  const { packs } = await discoverPacks({ localRoot: ROOT });
  return packs.filter((p) => !p.local && p.prose && existsSync(join(ROOT, 'packs', p.id, 'README.md')));
};

test('each pack README indexes its RULES.md rules, in order, with their word counts', async () => {
  for (const pack of await packsWithProse()) {
    const rules = ruleBlocks(readFileSync(join(ROOT, 'packs', pack.id, pack.prose), 'utf8'));
    if (!rules.length) continue;
    const rows = readmeRuleIndex(readFileSync(join(ROOT, 'packs', pack.id, 'README.md'), 'utf8'));

    assert.equal(
      rows.length, rules.length,
      `packs/${pack.id}/README.md indexes ${rows.length} rules; ${pack.prose} carries ${rules.length}. Add a row for every rule, in the order the prose lists them.`
    );
    rules.forEach((rule, i) => {
      assert.equal(
        rows[i].words, rule.words,
        `packs/${pack.id}/README.md row ${i + 1} ("${rows[i].label}") says ${rows[i].words} words; "${rule.leadIn}" is ${rule.words}. Recount the row in the same change that edits the rule.`
      );
    });
  }
});

test('each pack README lists every check it runs, with a severity and a reason', async () => {
  const { packs } = await discoverPacks({ localRoot: ROOT });
  for (const pack of packs.filter((p) => !p.local)) {
    const checks = [...(pack.worldRules ?? []), ...(pack.workRules ?? []), ...(pack.skillChecks ?? [])];
    if (!checks.length) continue;
    const readme = join(ROOT, 'packs', pack.id, 'README.md');
    assert.ok(existsSync(readme), `packs/${pack.id} runs ${checks.length} checks and has no README to index them.`);
    const rows = checkRows(readFileSync(readme, 'utf8'));
    for (const check of checks) {
      const row = rows.get(check.id);
      assert.ok(row, `packs/${pack.id}/README.md does not list the \`${check.id}\` check. Add a row for it in the checks table.`);
      assert.ok(
        SEVERITIES.includes(row.severity),
        `packs/${pack.id}/README.md gives \`${check.id}\` severity "${row.severity}"; use one of ${SEVERITIES.join(', ')}.`
      );
      assert.ok(
        REASONS.includes(row.reason),
        `packs/${pack.id}/README.md gives \`${check.id}\` reason "${row.reason}"; use one of ${REASONS.join(', ')}.`
      );
    }
  }
});

// A checks table's rows are keyed by the check id in their first cell, and read
// `| Check | Severity | Reason | Enforcement |`.
function checkRows(readme) {
  const rows = new Map();
  for (const line of readme.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const id = /^`([^`]+)`$/.exec(cells[0]);
    if (id && cells.length === 4) rows.set(id[1], { severity: cells[1], reason: cells[2] });
  }
  return rows;
}

test("packs/README.md's prose tally equals the packs' own rule indexes", async () => {
  let packs = 0, rules = 0, words = 0;
  for (const pack of await packsWithProse()) {
    const blocks = ruleBlocks(readFileSync(join(ROOT, 'packs', pack.id, pack.prose), 'utf8'));
    if (!blocks.length) continue;
    packs += 1;
    rules += blocks.length;
    words += blocks.reduce((sum, b) => sum + b.words, 0);
  }
  const catalog = readFileSync(join(ROOT, 'packs/README.md'), 'utf8');
  const m = /\*\*(\d+)\*\* across (\d+) packs, \*\*([\d,]+) words\*\*/.exec(catalog);
  assert.ok(m, 'packs/README.md carries no parseable prose tally — keep the counts in the corpus-tally table so this guard can read them.');
  assert.deepEqual(
    { rules: Number(m[1]), packs: Number(m[2]), words: Number(m[3].replace(/,/g, '')) },
    { rules, packs, words },
    'the corpus tally disagrees with the packs\' rule indexes. Update it in the same change that adds or removes a rule.'
  );
});

test('every rule-index row draws its severity and reason from the closed vocabularies', async () => {
  for (const pack of await packsWithProse()) {
    for (const row of readmeRuleIndex(readFileSync(join(ROOT, 'packs', pack.id, 'README.md'), 'utf8'))) {
      assert.ok(
        SEVERITIES.includes(row.severity),
        `packs/${pack.id}/README.md row "${row.label}" has severity "${row.severity}"; use one of ${SEVERITIES.join(', ')}.`
      );
      assert.ok(
        REASONS.includes(row.reason),
        `packs/${pack.id}/README.md row "${row.label}" has reason "${row.reason}"; use one of ${REASONS.join(', ')}.`
      );
      assert.ok(
        row.label.split(/\s+/).length < 8,
        `packs/${pack.id}/README.md row "${row.label}" runs to ${row.label.split(/\s+/).length} words; a rule's name stays under 8 — the prose says the rest.`
      );
    }
  }
});
