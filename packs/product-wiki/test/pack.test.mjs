import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, writeFiles, declaredCheck } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import pack from '../pack.mjs';

const layout = declaredCheck('packs/product-wiki', 'product-wiki-layout');
const pageSections = declaredCheck('packs/product-wiki', 'product-wiki-page-sections');
const keyInsights = declaredCheck('packs/product-wiki', 'product-wiki-key-insights');
const growthLog = declaredCheck('packs/product-wiki', 'product-wiki-growth-log');
const sources = declaredCheck('packs/product-wiki', 'product-wiki-sources');
const freshness = declaredCheck('packs/product-wiki', 'product-wiki-freshness');
import wikiGrowth from '../tasks/wiki-growth/task.mjs';
import { evaluatePrecondition, preconditionSignals } from '../../claudinite-tasks/shared-code/preconditions.mjs';
// Built through the real path: a forbidReferences entry in the pack's own
// declared-checks.json, compiled by the declarative engine.
const isolation = declaredCheck('packs/product-wiki', 'product-wiki-isolation');

const here = dirname(fileURLToPath(import.meta.url));
const canonRoot = join(here, '..', '..', '..');

// All dates are computed relative to Date.now() so the suite never rots.
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const wikiPage = ({
  title = 'Market',
  seedDate = daysAgo(1),
  sources: src = '- [Example](https://example.com/x)',
  insights = '- The market is smaller than assumed.\n- Two competitors already ship the core feature.',
} = {}) =>
  `# ${title}\n\nIntro.\n\n## Key insights\n\n${insights}\n\n## Findings\n\n- a cited claim\n\n## Sources\n\n${src}\n\n## Open questions\n\n- next?\n\n## Growth log\n\n- **${seedDate}** — initial seed.\n`;

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

test('pack manifest: marker, prose, the coded rule plus the seven declared checks (the isolation barrier among them)', () => {
  assert.equal(pack.marker, 'product-wiki/product-requirements/README.md');
  // The prose is the RULES.md beside the manifest, by the loader's convention —
  // so the file on disk is what carries it, and the manifest says nothing.
  assert.ok(existsSync(join(dirname(fileURLToPath(import.meta.url)), '../../../packs/product-wiki/RULES.md')));
  assert.equal(pack.prose, undefined);
  // The pack CODES no rule: every one of its checks — the layout skeleton, the
  // page grammar, the isolation barrier — is declared in declared-checks.json
  // beside the manifest, which the registry discovers and appends. So there is no
  // rule directory at all.
  assert.equal(existsSync(join(here, '..', 'worldRules')), false);
  assert.equal(existsSync(join(here, '..', 'workRules')), false);
  const ids = [layout, isolation, pageSections, keyInsights, growthLog, sources, freshness].map((r) => r.id);
  assert.equal(new Set(ids).size, 7);
  assert.ok(ids.every((id) => id.startsWith('product-wiki-')));
  assert.deepEqual(pack.requires, ['barriers']);
  assert.equal(pack.contributes, undefined);
  // The pack's scheduled task is NOT a pack.mjs slot any more — the repo's
  // scheduler finds tasks/<name>/task.mjs structurally (#394).
  assert.equal(pack.run_daily, undefined);
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

test('layout: a freshly written, not-yet-staged scaffold satisfies the check', () => {
  assert.deepEqual(run(layout, SCAFFOLD, { uncommitted: true }), []);
});

// --- product-wiki-page-sections ------------------------------------------------

test('page-sections: suffixed and case-varied headings pass; nested wikis are checked; reserved trees are not', () => {
  const clean = run(pageSections, {
    ...SCAFFOLD,
    'product-wiki/Users/README.md':
      '# Users\n\n## KEY INSIGHTS\n\n- Buyers decide before they compare.\n\n## SOURCES\n\n## Growth Log\n\n- **2026-07-01** — seed.\n\n## Open questions (for the next growth pass)\n\n- q\n',
    // Reserved subtrees and the index are exempt even when bare:
    'product-wiki/sample-data/README.md': '# sample data\n',
    'product-wiki/product-requirements/notes/README.md': '# notes\n',
  });
  assert.deepEqual(clean, []);

  const nested = run(pageSections, { ...SCAFFOLD, 'product-wiki/Users/competitors/README.md': '# bare\n' });
  assert.equal(nested.length, 4); // nested wiki page IS checked — one finding per section
  assert.ok(nested.every((x) => x.file === 'product-wiki/Users/competitors/README.md'));
});

test('page-sections: one finding naming exactly the missing section', () => {
  const page = wikiPage().replace(/## Growth log\n/, '## History\n');
  const f = run(pageSections, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /"## Growth log"/);
});

test('page-sections: headings inside a code fence do not satisfy the requirement', () => {
  const page = '# Wiki\n\nA template example:\n\n```markdown\n## Key insights\n\n- an example insight\n\n## Sources\n\n## Open questions\n\n## Growth log\n\n- **YYYY-MM-DD** — initial seed.\n```\n';
  const f = run(pageSections, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 4);
});

// --- product-wiki-key-insights -----------------------------------------------

test('key-insights: a leading, bulleted, succinct header passes — case-varied heading and hard-wrapped bullets too', () => {
  assert.deepEqual(run(keyInsights, SCAFFOLD), []);
  const wrapped = wikiPage({
    insights: '- **KEY INSIGHTS** works as a heading, and this bullet\n  carries onto a second line.\n\n- so does a blank line between bullets.',
  }).replace('## Key insights', '## KEY INSIGHTS (the reader header)');
  assert.deepEqual(run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': wrapped }), []);
});

test('key-insights: a header that does not lead the page is flagged, naming what leads instead', () => {
  const page = `# Market\n\nIntro.\n\n## Findings\n\n- a cited claim\n\n## Key insights\n\n- the header, buried.\n\n## Sources\n\n- [Example](https://example.com/x)\n\n## Open questions\n\n- next?\n\n## Growth log\n\n- **${daysAgo(1)}** — initial seed.\n`;
  const f = run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': page });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'blocking');
  assert.match(f[0].what, /opens with "## Findings"/);
});

test('key-insights: a header with no bullets is flagged; prose in it is flagged at its line', () => {
  const empty = run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ insights: '' }) });
  assert.equal(empty.length, 1);
  assert.match(empty[0].what, /no bullets/);

  const prose = run(keyInsights, {
    ...SCAFFOLD,
    'product-wiki/Market/README.md': wikiPage({ insights: 'This page summarises the market.\n\n- and one real insight.' }),
  });
  assert.equal(prose.length, 1);
  assert.match(prose[0].what, /prose in the Key insights header/);
  assert.equal(typeof prose[0].line, 'number');
});

test('key-insights: a header grown past seven bullets is a second body', () => {
  const many = Array.from({ length: 8 }, (_, i) => `- insight number ${i + 1}.`).join('\n');
  const f = run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ insights: many }) });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /8 bullets \(max 7\)/);

  const seven = Array.from({ length: 7 }, (_, i) => `- insight number ${i + 1}.`).join('\n');
  assert.deepEqual(run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ insights: seven }) }), []);
});

test('key-insights: a bullet that keeps qualifying itself is flagged over its whole block, so wrapping cannot hide it', () => {
  // The cap is tight on purpose: a terse finding passes, the same finding with
  // its qualifiers, hedges and citation dragged up out of the body does not.
  const terse = '- Two thirds of buyers buy one ticket — the Fringe is one decision, not a run of shows.';
  assert.deepEqual(run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ insights: terse }) }), []);

  const long = `- ${'the market is crowded and this sentence keeps qualifying itself. '.repeat(3)}`;
  const oneLine = run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ insights: long }) });
  assert.equal(oneLine.length, 1);
  assert.match(oneLine[0].what, /max 140/);

  const wrapped = `- ${'the market is crowded and this sentence keeps going. '.repeat(2)}\n  ${'and it continues onto a second line for a while longer. '.repeat(2)}`;
  assert.equal(run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': wikiPage({ insights: wrapped }) }).length, 1);
});

test('key-insights: a page missing the heading entirely is page-sections territory, not ours', () => {
  const page = wikiPage().replace(/## Key insights\n\n[^#]*/, '');
  assert.deepEqual(run(keyInsights, { ...SCAFFOLD, 'product-wiki/Market/README.md': page }), []);
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
    '.claudinite-settings.json': '{ "packs": ["product-wiki"], "accept": [ { "rule": "product-wiki-isolation", "path": "product-wiki/Market/README.md", "reason": "r" } ] }\n',
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
  assert.equal(f[0].file, '.claudinite-settings.json');
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
      '.claudinite-settings.json': `${JSON.stringify({
        packs: ['product-wiki'],
        accept: [{ rule: 'product-wiki-isolation', path: 'dev/notes.md', reason: 'deliberate ledger reference' }],
      }, null, 2)}\n`,
    });
    const r = spawnSync(process.execPath, [join(canonRoot, 'engine', 'checks', 'check_the_world.mjs'), '--root', root], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { cleanup(root); }
});

// --- the scheduled task declaration ----------------------------------------------------

// An ACTIVE repo, which every wiki-growth verdict below starts from: the pass is
// gated on the repo being worked in, so a fixture that skipped it would only ever
// be testing the silence gate.
const active = (over = {}) => ({
  commits: { substantiveChange: true }, issues: { open: [], touched: [] },
  prs: { open: [], touched: [] }, conversationLogs: {}, ...over,
});
const verdict = (signals) => evaluatePrecondition({ decl: wikiGrowth }, signals);

// Only the claims that can actually come apart. The declaration's own values
// (frequency, agent_model, expected_outcome…) are not asserted: re-stating a
// literal from the file under test proves nothing and turns every deliberate
// change into a two-file edit — see the writing-tests skill, "Never pin a
// declaration to itself".
test('wiki-growth task: the worker doc it names exists, and its signals are derived from its conditions', () => {
  // `precondition_signals` is gone: each condition names what it reads, so the
  // collector union cannot disagree with the gate.
  assert.equal(wikiGrowth.precondition_signals, undefined);
  assert.deepEqual(preconditionSignals(wikiGrowth.preconditions, new Map()).sort(),
    ['commits', 'conversationLogs', 'issues', 'prs']);
  assert.ok(existsSync(join(canonRoot, 'packs/product-wiki/tasks/wiki-growth', wikiGrowth.agent_instructions)),
    `worker doc missing: ${wikiGrowth.agent_instructions}`);
});

// THE SILENCE GATE, stated positively (task-preconditions DESIGN): the subject is
// the world, but the value is zero on a repo nobody works in, and a task's own
// output is not activity — the collectors strip it out before the condition sees
// it. The first active window resumes the pass.
test('wiki-growth precondition: it sleeps on a silent repo and resumes on the first active window', () => {
  const silent = verdict({
    commits: { substantiveChange: false }, issues: { open: [], touched: [] },
    prs: { open: [], touched: [] }, conversationLogs: {},
  });
  assert.equal(silent.run, false);
  assert.match(silent.reason, /silent in the window/);

  const active = verdict({
    commits: { substantiveChange: true }, issues: { open: [], touched: [] },
    prs: { open: [], touched: [] }, conversationLogs: {},
  });
  assert.equal(active.run, true);
});

// The other condition, and it is the only one that can decline an ACTIVE repo: an
// open PR with a pending `product-wiki/` change means wiki work is waiting for
// review, and a second unreviewed round is never stacked on it. It reads the PR's
// own CONTENT, so a human's wiki edit in flight gates the round exactly as the
// task's own PR does.
test('wiki-growth precondition: an active repo declines ONLY while a pending product-wiki PR is open', () => {
  const withPr = verdict(active({
    prs: { open: [{ number: 12, title: 'wiki round', changedPaths: ['product-wiki/Market/README.md'] }], touched: [] },
  }));
  assert.equal(withPr.run, false);
  assert.match(withPr.reason, /#12/);
  assert.match(withPr.reason, /product-wiki\//);

  // A PR whose paths could not be read at all is unknown, not clear — the arm that
  // makes the gate survive an unreadable file list and an engine that predates it.
  for (const opaque of [{ number: 13, title: 'unreadable' }, { number: 13, title: 'unreadable', changedPaths: null }]) {
    const v = verdict(active({ prs: { open: [opaque], touched: [] } }));
    assert.equal(v.run, false);
    assert.match(v.reason, /#13/);
    assert.match(v.reason, /unknown/);
  }

  const clear = [
    {},                                                                              // nothing pending
    { prs: { open: [{ number: 9, title: 'other', changedPaths: ['src/app.js'] }], touched: [] } },
    { prs: { open: [{ number: 9, title: 'empty diff', changedPaths: [] }], touched: [] } },
    // root-anchored: a nested directory of the same name, or a sibling whose name
    // merely starts the same, is not the tree
    { prs: { open: [{ number: 9, title: 'lookalike', changedPaths: ['docs/product-wiki/README.md', 'product-wikis/x.md'] }], touched: [] } },
  ];
  for (const over of clear) {
    const v = verdict(active(over));
    assert.equal(v.run, true, `declined for ${JSON.stringify(over)}`);
    assert.ok(Array.isArray(v.context), 'context is always an array, even when empty');
  }
});

// What a granted run then works on — including spot-checking pages a wiki move may
// have superseded — is scope, and scope is the worker's (task-preconditions DESIGN).
test('wiki-growth: what a granted run reads is task.md\'s, not the trigger\'s', () => {
  const worker = readFileSync(join(canonRoot, 'packs/product-wiki/tasks/wiki-growth', wikiGrowth.agent_instructions), 'utf8');
  assert.match(worker, /spot-check the pages it may have superseded/);
});
