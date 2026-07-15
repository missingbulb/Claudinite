import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, writeFiles } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import pack from './pack.mjs';
import layout from './layout.mjs';
import pageSections from './page-sections.mjs';
import growthLog from './growth-log.mjs';
import sources from './sources.mjs';
import freshness from './freshness.mjs';
import isolation from './isolation.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const canonRoot = join(here, '..', '..');

// All dates are computed relative to Date.now() so the suite never rots.
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const wikiPage = ({ title = 'MarketWiki', seedDate = daysAgo(1), sources: src = '- [Example](https://example.com/x)' } = {}) =>
  `# ${title}\n\nIntro.\n\n## Findings\n\n- a cited claim\n\n## Sources\n\n${src}\n\n## Open questions\n\n- next?\n\n## Growth log\n\n- **${seedDate}** — initial seed.\n`;

const SCAFFOLD = {
  'product/README.md': '# product\n\nThe product research root.\n',
  'product/product-requirements/README.md': '# Product requirements\n\nThe reviewed sink.\n',
  'product/MarketWiki/README.md': wikiPage(),
};

// Run one rule over a scratch repo in mode 'all' (optionally overlay packConfig).
function run(rule, files, { mode = 'all', packConfig } = {}) {
  const root = makeRepo({ changed: files });
  try {
    const ctx = buildContext({ root, mode });
    if (packConfig !== undefined) {
      ctx.config = { ...ctx.config, packConfig: { 'product-wiki': packConfig } };
    }
    return rule.run(ctx);
  } finally { cleanup(root); }
}

// --- pack manifest -----------------------------------------------------------

test('pack manifest: id, marker, six uniquely-named rules, one run_daily task', () => {
  assert.equal(pack.id, 'product-wiki');
  assert.equal(pack.marker, 'product/product-requirements/README.md');
  assert.equal(pack.prose, 'RULES.md');
  assert.equal(pack.rules.length, 6);
  const ids = pack.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, 6);
  assert.ok(ids.every((id) => id.startsWith('product-wiki-')));
  assert.equal(pack.run_daily.length, 1);
});

test('detect fires exactly on the sink marker', () => {
  assert.equal(pack.detect({ tracked: ['product/product-requirements/README.md'] }), true);
  assert.equal(pack.detect({ tracked: ['product/MarketWiki/README.md'] }), false);
});

// --- product-wiki-layout ------------------------------------------------------

test('layout: full scaffold is clean; absent packConfig adds nothing', () => {
  assert.deepEqual(run(layout, SCAFFOLD), []);
});

test('layout: no product/ at all yields both skeleton findings', () => {
  const f = run(layout, { 'src/a.js': 'x\n' });
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.file).sort(), ['product/README.md', 'product/product-requirements/README.md']);
});

test('layout: missing sink alone yields exactly one finding naming it', () => {
  const f = run(layout, { 'product/README.md': '# product\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'product/product-requirements/README.md');
  assert.equal(f[0].severity, 'blocking');
});

test('layout: any config object on the pack entry is a blocking settings finding', () => {
  const f = run(layout, SCAFFOLD, { packConfig: {} });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, '.claudinite-checks.json');
  assert.equal(f[0].severity, 'blocking');
  assert.match(f[0].what, /takes no config/);
});

// --- product-wiki-page-sections ------------------------------------------------

test('page-sections: suffixed and case-varied headings pass; nested wikis are checked; reserved trees are not', () => {
  const clean = run(pageSections, {
    ...SCAFFOLD,
    'product/UsersWiki/README.md':
      '# UsersWiki\n\n## SOURCES\n\n## Growth Log\n\n- **2026-07-01** — seed.\n\n## Open questions (for the next growth pass)\n\n- q\n',
    // Reserved subtrees and the index are exempt even when bare:
    'product/sample-data/README.md': '# sample data\n',
    'product/product-requirements/notes/README.md': '# notes\n',
  });
  assert.deepEqual(clean, []);

  const nested = run(pageSections, { ...SCAFFOLD, 'product/UsersWiki/competitors/README.md': '# bare\n' });
  assert.equal(nested.length, 3); // nested wiki page IS checked — one finding per section
  assert.ok(nested.every((x) => x.file === 'product/UsersWiki/competitors/README.md'));
});

test('page-sections: one finding naming exactly the missing section', () => {
  const page = wikiPage().replace(/## Growth log\n/, '## History\n');
  const f = run(pageSections, { ...SCAFFOLD, 'product/MarketWiki/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /"## Growth log"/);
});

// --- product-wiki-growth-log ----------------------------------------------------

test('growth-log: bold and plain dated bullets, continuations, and prose pass', () => {
  const page = wikiPage().replace(
    /## Growth log\n\n[^\n]*\n/,
    `## Growth log\n\nEntries below, newest last.\n\n- **${daysAgo(3)}** — seed.\n  carried onto a second line.\n- ${daysAgo(2)} — plain-date entry.\n`
  );
  assert.deepEqual(run(growthLog, { ...SCAFFOLD, 'product/MarketWiki/README.md': page }), []);
});

test('growth-log: an undated bullet is flagged at its line', () => {
  const page = wikiPage().replace(/- \*\*[^\n]*\n/, '- added a claim without dating it\n');
  const f = run(growthLog, { ...SCAFFOLD, 'product/MarketWiki/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /does not lead with its date/);
  assert.equal(typeof f[0].line, 'number');
});

test('growth-log: an impossible calendar date is flagged', () => {
  const page = wikiPage({ seedDate: '2026-13-40' });
  const f = run(growthLog, { ...SCAFFOLD, 'product/MarketWiki/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /not a real calendar date/);
});

test('growth-log: a section with no bullets at all is the no-entries finding', () => {
  const page = wikiPage().replace(/## Growth log\n\n[^\n]*\n/, '## Growth log\n\nnothing recorded yet.\n');
  const f = run(growthLog, { ...SCAFFOLD, 'product/MarketWiki/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /no dated entries/);
});

test('growth-log: a page missing the heading entirely is page-sections territory, not ours', () => {
  const page = wikiPage().replace(/## Growth log\n\n[^\n]*\n/, '');
  assert.deepEqual(run(growthLog, { ...SCAFFOLD, 'product/MarketWiki/README.md': page }), []);
});

// --- product-wiki-sources --------------------------------------------------------

test('sources: linked bullets plus link-free prose pass; an empty section passes', () => {
  const page = wikiPage({
    sources: 'Personas here are hypotheses from design decisions, not yet user research.\n\n- [Report](https://example.com/report)',
  });
  assert.deepEqual(run(sources, { ...SCAFFOLD, 'product/MarketWiki/README.md': page }), []);
  const empty = wikiPage().replace(/## Sources\n\n[^\n]*\n/, '## Sources\n\n');
  assert.deepEqual(run(sources, { ...SCAFFOLD, 'product/MarketWiki/README.md': empty }), []);
});

test('sources: a bullet naming a source with no URL is flagged, quoting it', () => {
  const page = wikiPage({ sources: '- The 2026 Calendar Market Report' });
  const f = run(sources, { ...SCAFFOLD, 'product/MarketWiki/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /Calendar Market Report/);
});

// --- product-wiki-freshness -------------------------------------------------------

test('freshness: a recent entry is fresh; changed mode never fires; undated logs are skipped', () => {
  assert.deepEqual(run(freshness, { ...SCAFFOLD, 'product/MarketWiki/README.md': wikiPage({ seedDate: daysAgo(10) }) }), []);
  assert.deepEqual(
    run(freshness, { ...SCAFFOLD, 'product/MarketWiki/README.md': wikiPage({ seedDate: daysAgo(60) }) }, { mode: 'changed' }),
    []
  );
  const undated = wikiPage().replace(/## Growth log\n\n[^\n]*\n/, '## Growth log\n\n- seeded at some point.\n');
  assert.deepEqual(run(freshness, { ...SCAFFOLD, 'product/MarketWiki/README.md': undated }), []);
});

test('freshness: a stale page gets one per-page advisory; fresh siblings stay silent', () => {
  const f = run(freshness, {
    ...SCAFFOLD,
    'product/MarketWiki/README.md': wikiPage({ seedDate: daysAgo(60) }),
    'product/UsersWiki/README.md': wikiPage({ title: 'UsersWiki', seedDate: daysAgo(1) }),
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'product/MarketWiki/README.md');
  assert.equal(f[0].severity, 'advisory');
  assert.match(f[0].what, /60 days old/);
});

test('freshness: a far-future date cannot mark a stale page fresh', () => {
  const page = wikiPage({ seedDate: daysAgo(60) }).replace(
    /## Growth log\n/,
    `## Growth log\n\n- **${daysAgo(-30)}** — typo'd future entry.\n`
  );
  const f = run(freshness, { ...SCAFFOLD, 'product/MarketWiki/README.md': page });
  assert.equal(f.length, 1);
});

// --- product-wiki-isolation --------------------------------------------------------

test('isolation: the crossing point, the product/ subtree, the index file, and the settings file are all open', () => {
  const f = run(isolation, {
    ...SCAFFOLD,
    'product/UsersWiki/README.md': wikiPage({ title: 'UsersWiki' }),
    'product/sample-data/example.json': '{}\n',
    // allow: any guarded file may reference the sink
    'src/x.js': "// distilled in product/product-requirements/README.md\n",
    // carve-out: wikis reference each other and sample-data freely
    'product/MarketWiki/notes.md': 'see product/UsersWiki/README.md and product/sample-data/example.json\n',
    // files directly under product/ are not barred (only child dirs are)
    'docs/map.md': 'the research index is product/README.md\n',
    // the settings file legitimately spells wiki paths
    '.claudinite-checks.json': '{ "packs": ["product-wiki"], "accept": [ { "rule": "product-wiki-isolation", "path": "product/MarketWiki/README.md", "reason": "r" } ] }\n',
  });
  assert.deepEqual(f, []);
});

test('isolation: an outside doc referencing a wiki page is a blocking crossing; test files are never scanned', () => {
  const files = {
    ...SCAFFOLD,
    'product/UsersWiki/README.md': wikiPage({ title: 'UsersWiki' }),
    'dev/notes.md': 'see product/UsersWiki/README.md for the persona list\n',
  };
  const f = run(isolation, files);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'product-wiki-isolation');
  assert.equal(f[0].file, 'dev/notes.md');
  assert.equal(f[0].severity, 'blocking');

  const inTest = run(isolation, {
    ...SCAFFOLD,
    'product/UsersWiki/README.md': wikiPage({ title: 'UsersWiki' }),
    'dev/foo.test.mjs': "import x from '../product/UsersWiki/README.md';\n",
  });
  assert.deepEqual(inTest, []);
});

test('isolation: an empty product/ expansion fails closed instead of disarming', () => {
  const f = run(isolation, { 'src/a.js': 'x\n' });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, '.claudinite-checks.json');
  assert.equal(f[0].severity, 'blocking');
  assert.match(f[0].what, /matched no/);
});

// --- accept plumbing (CLI integration) ----------------------------------------------

test('runner integration: a reasoned accept excuses an isolation crossing; a reasonless one blocks', () => {
  const crossing = {
    ...SCAFFOLD,
    'dev/notes.md': 'see product/MarketWiki/README.md\n',
  };
  const runCli = (acceptEntry) => {
    const root = makeRepo({ changed: crossing });
    try {
      writeFiles(root, {
        '.claudinite-checks.json': `${JSON.stringify({ packs: ['product-wiki'], accept: [acceptEntry] }, null, 2)}\n`,
      });
      return spawnSync(process.execPath, [join(canonRoot, 'checks', 'run.mjs'), '--root', root], { encoding: 'utf8' });
    } finally { cleanup(root); }
  };
  const ok = runCli({ rule: 'product-wiki-isolation', path: 'dev/notes.md', reason: 'deliberate ledger reference' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = runCli({ rule: 'product-wiki-isolation', path: 'dev/notes.md' });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /no reason/);
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
