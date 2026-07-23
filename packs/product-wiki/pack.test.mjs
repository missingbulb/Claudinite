import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, writeFiles } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import pack from './pack.mjs';
import layout from './layout.mjs';
import pageSections from './page-sections.mjs';
import growthLog from './growth-log.mjs';
import sources from './sources.mjs';
import freshness from './freshness.mjs';
// Built through the real path: the product-wiki manifest contributes it as
// data and the barriers pack's factory turns it into the rule.
import productWikiPack from './pack.mjs';
import { contributedBarrierRules } from '../barriers/contributed.mjs';
const isolation = contributedBarrierRules([productWikiPack]).find((r) => r.id === 'product-wiki-isolation');

const here = dirname(fileURLToPath(import.meta.url));
const canonRoot = join(here, '..', '..');

// All dates are computed relative to Date.now() so the suite never rots.
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const wikiPage = ({ title = 'Market', seedDate = daysAgo(1), sources: src = '- [Example](https://example.com/x)' } = {}) =>
  `# ${title}\n\nIntro.\n\n## Findings\n\n- a cited claim\n\n## Sources\n\n${src}\n\n## Open questions\n\n- next?\n\n## Growth log\n\n- **${seedDate}** — initial seed.\n`;

const SCAFFOLD = {
  'product-wiki/README.md': '# product\n\nThe product research root.\n',
  'product-wiki/product-requirements/README.md': '# Product requirements\n\nThe reviewed sink.\n',
  'product-wiki/Market/README.md': wikiPage(),
};

// Run one rule over a scratch repo in mode 'all' (optionally overlay
// packConfig, inject a fixed clock, or leave files uncommitted/untracked).
function run(rule, files, { mode = 'all', packConfig, now, uncommitted } = {}) {
  const root = makeRepo(uncommitted ? { uncommitted: files } : { changed: files });
  try {
    const ctx = buildContext({ root, mode });
    if (packConfig !== undefined) {
      ctx.config = { ...ctx.config, packConfig: { 'product-wiki': packConfig } };
    }
    if (now !== undefined) ctx.now = now;
    return rule.run(ctx);
  } finally { cleanup(root); }
}

// --- pack manifest -----------------------------------------------------------

test('pack manifest: id, marker, five uniquely-named rules, the contributed isolation barrier, one run_daily task', () => {
  assert.equal(pack.id, 'product-wiki');
  assert.equal(pack.marker, 'product-wiki/product-requirements/README.md');
  assert.equal(pack.prose, 'RULES.md');
  assert.equal(pack.rules.length, 5);
  const ids = pack.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, 5);
  assert.ok(ids.every((id) => id.startsWith('product-wiki-')));
  // The isolation wall rides the barriers mechanism: declared (requires) and
  // contributed as manifest data, never a cross-pack import (pack-independence).
  assert.deepEqual(pack.requires, ['barriers']);
  assert.equal(pack.contributes.barriers.length, 1);
  assert.equal(pack.contributes.barriers[0].id, 'product-wiki-isolation');
  assert.equal(pack.run_daily.length, 1);
  // Adoption interview scopes the research: product, users, market.
  assert.deepEqual(pack.questions.map((q) => q.id), ['product', 'users', 'market']);
  assert.ok(pack.questions.every((q) => q.prompt && q.distill));
});

test('detect fires exactly on the sink marker', () => {
  assert.equal(pack.detect({ tracked: ['product-wiki/product-requirements/README.md'] }), true);
  assert.equal(pack.detect({ tracked: ['product-wiki/Market/README.md'] }), false);
});

// --- product-wiki-layout ------------------------------------------------------

test('layout: full scaffold is clean; absent packConfig adds nothing', () => {
  assert.deepEqual(run(layout, SCAFFOLD), []);
});

test('layout: no product-wiki/ at all yields both skeleton findings', () => {
  const f = run(layout, { 'src/a.js': 'x\n' });
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.file).sort(), ['product-wiki/README.md', 'product-wiki/product-requirements/README.md']);
});

test('layout: missing sink alone yields exactly one finding naming it', () => {
  const f = run(layout, { 'product-wiki/README.md': '# product\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'product-wiki/product-requirements/README.md');
  assert.equal(f[0].severity, 'blocking');
});

test('layout: any config object on the pack entry is a blocking settings finding', () => {
  const f = run(layout, SCAFFOLD, { packConfig: {} });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, '.claudinite-checks.json');
  assert.equal(f[0].severity, 'blocking');
  assert.match(f[0].what, /takes no config/);
});

test('layout: a freshly written, not-yet-staged scaffold satisfies the check', () => {
  assert.deepEqual(run(layout, SCAFFOLD, { uncommitted: true }), []);
});

// --- product-wiki-page-sections ------------------------------------------------

test('page-sections: suffixed and case-varied headings pass; nested wikis are checked; reserved trees are not', () => {
  const clean = run(pageSections, {
    ...SCAFFOLD,
    'product-wiki/Users/README.md':
      '# Users\n\n## SOURCES\n\n## Growth Log\n\n- **2026-07-01** — seed.\n\n## Open questions (for the next growth pass)\n\n- q\n',
    // Reserved subtrees and the index are exempt even when bare:
    'product-wiki/sample-data/README.md': '# sample data\n',
    'product-wiki/product-requirements/notes/README.md': '# notes\n',
  });
  assert.deepEqual(clean, []);

  const nested = run(pageSections, { ...SCAFFOLD, 'product-wiki/Users/competitors/README.md': '# bare\n' });
  assert.equal(nested.length, 3); // nested wiki page IS checked — one finding per section
  assert.ok(nested.every((x) => x.file === 'product-wiki/Users/competitors/README.md'));
});

test('page-sections: one finding naming exactly the missing section', () => {
  const page = wikiPage().replace(/## Growth log\n/, '## History\n');
  const f = run(pageSections, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /"## Growth log"/);
});

test('page-sections: headings inside a code fence do not satisfy the requirement', () => {
  const page = '# Wiki\n\nA template example:\n\n```markdown\n## Sources\n\n## Open questions\n\n## Growth log\n\n- **YYYY-MM-DD** — initial seed.\n```\n';
  const f = run(pageSections, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 3);
});

test('growth-log and sources: a fenced template inside a real page is not scanned', () => {
  const page = `${wikiPage()}\n## Template\n\n\`\`\`markdown\n## Growth log\n\n- **YYYY-MM-DD** — initial seed.\n\n## Sources\n\n- An uncited example source\n\`\`\`\n`;
  assert.deepEqual(run(growthLog, { ...SCAFFOLD, 'product-wiki/Market/README.md': page }), []);
  assert.deepEqual(run(sources, { ...SCAFFOLD, 'product-wiki/Market/README.md': page }), []);
});

// --- product-wiki-growth-log ----------------------------------------------------

test('growth-log: bold and plain dated bullets, continuations, and prose pass', () => {
  const page = wikiPage().replace(
    /## Growth log\n\n[^\n]*\n/,
    `## Growth log\n\nEntries below, newest last.\n\n- **${daysAgo(3)}** — seed.\n  carried onto a second line.\n- ${daysAgo(2)} — plain-date entry.\n`
  );
  assert.deepEqual(run(growthLog, { ...SCAFFOLD, 'product-wiki/Market/README.md': page }), []);
});

test('growth-log: an undated bullet is flagged at its line', () => {
  const page = wikiPage().replace(/- \*\*[^\n]*\n/, '- added a claim without dating it\n');
  const f = run(growthLog, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /does not lead with its date/);
  assert.equal(typeof f[0].line, 'number');
});

test('growth-log: a "+"-marked undated bullet cannot bypass the dating rule', () => {
  const page = wikiPage().replace(/## Growth log\n/, '## Growth log\n\n+ added competitor pricing, undated\n');
  const f = run(growthLog, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /does not lead with its date/);
});

test('growth-log: an impossible calendar date is flagged', () => {
  const page = wikiPage({ seedDate: '2026-13-40' });
  const f = run(growthLog, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /not a real calendar date/);
});

test('growth-log: a section with no bullets at all is the no-entries finding', () => {
  const page = wikiPage().replace(/## Growth log\n\n[^\n]*\n/, '## Growth log\n\nnothing recorded yet.\n');
  const f = run(growthLog, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /no dated entries/);
});

test('growth-log: a page missing the heading entirely is page-sections territory, not ours', () => {
  const page = wikiPage().replace(/## Growth log\n\n[^\n]*\n/, '');
  assert.deepEqual(run(growthLog, { ...SCAFFOLD, 'product-wiki/Market/README.md': page }), []);
});

// --- product-wiki-sources --------------------------------------------------------

test('sources: linked bullets plus link-free prose pass; an empty section passes', () => {
  const page = wikiPage({
    sources: 'Personas here are hypotheses from design decisions, not yet user research.\n\n- [Report](https://example.com/report)',
  });
  assert.deepEqual(run(sources, { ...SCAFFOLD, 'product-wiki/Market/README.md': page }), []);
  const empty = wikiPage().replace(/## Sources\n\n[^\n]*\n/, '## Sources\n\n');
  assert.deepEqual(run(sources, { ...SCAFFOLD, 'product-wiki/Market/README.md': empty }), []);
});

test('sources: a bullet naming a source with no URL is flagged, quoting it', () => {
  const page = wikiPage({ sources: '- The 2026 Calendar Market Report' });
  const f = run(sources, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /Calendar Market Report/);
});

test('sources: a bare URL verifies, a hard-wrapped bullet is judged over its block, "+" bullets are checked', () => {
  const ok = wikiPage({
    sources: '- <https://example.com/report>\n- The 2026 Calendar Market Report,\n  [full text](https://example.com/full)',
  });
  assert.deepEqual(run(sources, { ...SCAFFOLD, 'product-wiki/Market/README.md': ok }), []);
  const plus = wikiPage({ sources: '+ An unlinked source' });
  const f = run(sources, { ...SCAFFOLD, 'product-wiki/Market/README.md': plus });
  assert.equal(f.length, 1);
});

// --- product-wiki-freshness -------------------------------------------------------

test('freshness: a recent entry is fresh; changed mode never fires; undated logs are skipped', () => {
  assert.deepEqual(run(freshness, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ seedDate: daysAgo(10) }) }), []);
  assert.deepEqual(
    run(freshness, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ seedDate: daysAgo(60) }) }, { mode: 'changed' }),
    []
  );
  const undated = wikiPage().replace(/## Growth log\n\n[^\n]*\n/, '## Growth log\n\n- seeded at some point.\n');
  assert.deepEqual(run(freshness, { ...SCAFFOLD, 'product-wiki/Market/README.md': undated }), []);
});

test('freshness: a stale page gets one per-page advisory; fresh siblings stay silent', () => {
  const f = run(freshness, {
    ...SCAFFOLD,
    'product-wiki/Market/README.md': wikiPage({ seedDate: daysAgo(60) }),
    'product-wiki/Users/README.md': wikiPage({ title: 'Users', seedDate: daysAgo(1) }),
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'product-wiki/Market/README.md');
  assert.equal(f[0].severity, 'advisory');
  assert.match(f[0].what, /60 days old/);
});

test('freshness: a far-future date cannot mark a stale page fresh', () => {
  const page = wikiPage({ seedDate: daysAgo(60) }).replace(
    /## Growth log\n/,
    `## Growth log\n\n- **${daysAgo(-30)}** — typo'd future entry.\n`
  );
  const f = run(freshness, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
});

test('freshness: only entry-leading dates count — a recent date inside an old entry does not reset the clock', () => {
  const page = wikiPage().replace(
    /## Growth log\n\n[^\n]*\n/,
    `## Growth log\n\n- **${daysAgo(80)}** — noted; revisit the ${daysAgo(1)} report before next pass.\n`
  );
  const f = run(freshness, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /80 days old/);
});

test('freshness: the 45-day window boundary, pinned with an injected clock', () => {
  const NOW = Date.UTC(2030, 5, 20, 12, 0, 0);
  const at = (n) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
  const page = (n) => ({ ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ seedDate: at(n) }) });
  assert.deepEqual(run(freshness, page(45), { now: NOW }), []);
  assert.equal(run(freshness, page(46), { now: NOW }).length, 1);
});

// --- product-wiki-isolation --------------------------------------------------------

test('isolation: the crossing point, the product-wiki/ subtree, the index file, and the settings file are all open', () => {
  const f = run(isolation, {
    ...SCAFFOLD,
    'product-wiki/Users/README.md': wikiPage({ title: 'Users' }),
    'product-wiki/sample-data/example.json': '{}\n',
    // allow: any guarded file may reference the sink
    'src/x.js': "// distilled in product-wiki/product-requirements/README.md\n",
    // carve-out: wikis reference each other and sample-data freely
    'product-wiki/Market/notes.md': 'see product-wiki/Users/README.md and product-wiki/sample-data/example.json\n',
    // files directly under product-wiki/ are not barred (only child dirs are)
    'docs/map.md': 'the research index is product-wiki/README.md\n',
    // the settings file legitimately spells wiki paths
    '.claudinite-checks.json': '{ "packs": ["product-wiki"], "accept": [ { "rule": "product-wiki-isolation", "path": "product-wiki/Market/README.md", "reason": "r" } ] }\n',
  });
  assert.deepEqual(f, []);
});

test('isolation: an outside doc referencing a wiki page is a blocking crossing; test files are never scanned', () => {
  const files = {
    ...SCAFFOLD,
    'product-wiki/Users/README.md': wikiPage({ title: 'Users' }),
    'dev/notes.md': 'see product-wiki/Users/README.md for the persona list\n',
  };
  const f = run(isolation, files);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'product-wiki-isolation');
  assert.equal(f[0].file, 'dev/notes.md');
  assert.equal(f[0].severity, 'blocking');
  // The finding's own instruction must name the lever that actually works for
  // a pack-shipped barrier (an accept), not the engine's per-rule except.
  assert.match(f[0].fix, /accept/);
  assert.doesNotMatch(f[0].fix, /add a reviewed exception in \.claudinite-checks\.json if/);

  const inTest = run(isolation, {
    ...SCAFFOLD,
    'product-wiki/Users/README.md': wikiPage({ title: 'Users' }),
    'dev/foo.test.mjs': "import x from '../product-wiki/Users/README.md';\n",
  });
  assert.deepEqual(inTest, []);
});

test('isolation: agent-written wiki filenames never become repo-wide barred bare names', () => {
  const files = {
    ...SCAFFOLD,
    'product-wiki/sample-data/example-event.json': '{}\n',
    // A bare unique basename in prose must NOT fire (matchUniqueFilenames off)…
    'docs/note.md': 'the shape mirrors example-event.json\n',
  };
  assert.deepEqual(run(isolation, files), []);
  // …while an explicit path reference into wiki space still does.
  const withPath = run(isolation, { ...files, 'docs/deep.md': 'see product-wiki/sample-data/example-event.json\n' });
  assert.equal(withPath.length, 1);
  assert.equal(withPath[0].file, 'docs/deep.md');
});

test('isolation: an empty product-wiki/ expansion fails closed instead of disarming', () => {
  const f = run(isolation, { 'src/a.js': 'x\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, '.claudinite-checks.json');
  assert.equal(f[0].severity, 'blocking');
  assert.match(f[0].what, /matched no/);
});

// --- accept plumbing (CLI integration) ----------------------------------------------

// (The reasonless-accept-is-itself-a-finding half lives in engine/test/
// runner.test.mjs — a rule-agnostic applyConfig invariant this pack doesn't
// own. What's pack-specific here is that an ACCEPT, not a rule-owned except,
// is the lever that excuses a fixed barrier's crossing.)
test('runner integration: a reasoned accept excuses an isolation crossing', () => {
  const root = makeRepo({ changed: { ...SCAFFOLD, 'dev/notes.md': 'see product-wiki/Market/README.md\n' } });
  try {
    writeFiles(root, {
      '.claudinite-checks.json': `${JSON.stringify({
        packs: ['product-wiki'],
        accept: [{ rule: 'product-wiki-isolation', path: 'dev/notes.md', reason: 'deliberate ledger reference' }],
      }, null, 2)}\n`,
    });
    const r = spawnSync(process.execPath, [join(canonRoot, 'engine', 'checks', 'check_the_world.mjs'), '--root', root], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { cleanup(root); }
});

// --- run_daily descriptor -------------------------------------------------------------

test('wiki-growth gate: weekly full sweep only, never the canon home, never incremental signals', async () => {
  const task = pack.run_daily[0];
  assert.equal(task.id, 'wiki-growth');
  assert.equal(task.full_sweep_supported, true); // the gate keys on fullSweep — masked otherwise
  assert.ok(existsSync(join(canonRoot, task.worker)), `worker doc missing: ${task.worker}`);
  assert.deepEqual(await task.gate({}, { fullSweep: true }), { run: true, targets: {}, reason: 'weekly product-wiki growth pass' });
  assert.equal((await task.gate({}, { fullSweep: false, projectChanged: true, canonChanged: true })).run, false);
  assert.equal((await task.gate({}, { isHome: true, fullSweep: true })).run, false);
});
