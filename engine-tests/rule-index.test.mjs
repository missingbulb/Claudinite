import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';
import { ruleBlocks, readmeRuleIndex, proseSize, SEVERITIES, REASONS, SIZES } from './rule-index.mjs';

// A pack README's rule index states each prose rule's size band, the severity
// of ignoring it and the reason it exists. The band is derived from RULES.md,
// and RULES.md is appended to several times a week — so it is held against the
// prose here rather than trusted to stay current on its own.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every shared pack carrying prose, README or not: a pack that LOSES its README
// must fail the sweep below rather than drop out of it, and the count pins that
// the sweep ran over the shelf and not over whatever survived a filter.
const packsWithProse = async () => {
  const { packs } = await discoverPacks({ localRoot: ROOT });
  const withProse = packs.filter((p) => !p.local && p.prose);
  assert.ok(withProse.length >= 6, `the shelf has ${withProse.length} shared packs carrying prose`);
  return withProse;
};

test('each pack README indexes its RULES.md rules, in order, with their size bands', async () => {
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
        rows[i].size, proseSize(rule.words),
        `packs/${pack.id}/README.md row ${i + 1} ("${rows[i].label}") says ${rows[i].size} words; "${rule.leadIn}" is ${rule.words}, which is ${proseSize(rule.words)}. Restate the row's band in the same change that edits the rule.`
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
        SIZES.includes(row.size),
        `packs/${pack.id}/README.md row "${row.label}" states its length as "${row.size}"; use one of ${SIZES.join(', ')}.`
      );
      assert.ok(
        row.label.split(/\s+/).length < 8,
        `packs/${pack.id}/README.md row "${row.label}" runs to ${row.label.split(/\s+/).length} words; a rule's name stays under 8 — the prose says the rest.`
      );
    }
  }
});

// The ladder itself: each bound excludes its own value, so no length falls
// between two rungs or lands on both. The vocabulary a row is held to and the
// band a rule is given are derived from SIZE_BOUNDS separately, so the two are
// checked against each other rather than against a restatement of the ladder.
test('a rule of any length lands on exactly one rung of the size ladder', () => {
  for (const [words, expected] of [
    [0, '<20'], [19, '<20'], [20, '<50'], [49, '<50'], [50, '<100'], [99, '<100'],
    [100, '<200'], [199, '<200'], [200, '<500'], [499, '<500'], [500, '500+'], [5000, '500+'],
  ]) assert.equal(proseSize(words), expected, `${words} words`);

  const reachable = [...new Set(Array.from({ length: 600 }, (_, words) => proseSize(words)))];
  assert.deepEqual(
    reachable, SIZES,
    'every band a rule can be given must be one a row may state, and every band a row may state must be reachable'
  );
});
