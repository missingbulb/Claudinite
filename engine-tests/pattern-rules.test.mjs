import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, writeFiles } from './helpers.mjs';
import { buildContext } from '../engine/checks/helpers/repo-context.mjs';
import { patternRule } from '../engine/checks/helpers/pattern-rules.mjs';

// The declarative engine's own contract, proven over fixture rules — the pack
// declarations built on it are proven by their packs' existing tests.
const ctxOf = (root) => buildContext({ root, mode: 'all' });
const meta = (id) => ({
  id, severity: 'blocking', description: `fixture ${id}`, doc: 'engine/checks/README.md', why: 'fixture',
});

test('matchLines: match + unlessLineMatches, {match} templating, 1-indexed anchor', () => {
  const rule = patternRule({
    ...meta('fx-line'),
    scanFiles: /\.txt$/,
    matchLines: [{ match: /TOK_\w+/, unlessLineMatches: /allowed/, what: 'saw {match}', fix: 'remove it' }],
  });
  const root = makeRepo({ changed: { 'a.txt': 'clean\nTOK_ONE\nTOK_TWO allowed\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
    assert.equal(findings[0].what, 'saw TOK_ONE');
  } finally { cleanup(root); }
});

test('matchLines: first matching assertion wins per line; skipLinesMatching hides a line', () => {
  const rule = patternRule({
    ...meta('fx-first-wins'),
    scanFiles: /\.txt$/,
    skipLinesMatching: /^#/,
    matchLines: [
      { match: /alpha/, what: 'alpha', fix: 'f' },
      { match: /alpha|beta/, what: 'beta', fix: 'f' },
    ],
  });
  const root = makeRepo({ changed: { 'a.txt': 'alpha beta\n# alpha in a skipped line\nbeta\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => [f.line, f.what]), [[1, 'alpha'], [3, 'beta']]);
  } finally { cleanup(root); }
});

test('matchLines: whenFileMatches (all-of) and unlessFileMatches scope by the file\'s whole text', () => {
  const rule = patternRule({
    ...meta('fx-when'),
    scanFiles: /\.txt$/,
    matchLines: [{ match: /hit/, whenFileMatches: [/armed/, /live/], unlessFileMatches: /disarmed/, what: 'w', fix: 'f' }],
  });
  const root = makeRepo({ changed: {
    'both.txt': 'armed live\nhit\n',
    'half.txt': 'armed\nhit\n',
    'off.txt': 'armed live disarmed\nhit\n',
  } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => f.file), ['both.txt']);
  } finally { cleanup(root); }
});

test('checkEachFile: whenFileMatches-list + require / forbid, one finding per file, no line anchor', () => {
  const rule = patternRule({
    ...meta('fx-file'),
    scanFiles: /\.yml$/,
    checkEachFile: [
      { whenFileMatches: [/uses: deploy/, /root: true/], require: /pruned/, what: 'unpruned', fix: 'f' },
      { whenFileMatches: /uses: deploy/, forbid: /insecure/, what: 'insecure', fix: 'f' },
    ],
  });
  const root = makeRepo({ changed: {
    'bad.yml': 'uses: deploy\nroot: true\ninsecure\n',
    'good.yml': 'uses: deploy\nroot: true\npruned\n',
    'other.yml': 'root: true\ninsecure\n',
  } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => [f.file, f.what, f.line]),
      [['bad.yml', 'unpruned', null], ['bad.yml', 'insecure', null]]);
  } finally { cleanup(root); }
});

test('relevantWhen: pathExists / pathAbsent / trackedFileMatches / noTrackedFileMatches, rule-level and per-assertion', () => {
  const ruleExists = patternRule({
    ...meta('fx-gate-exists'),
    relevantWhen: { pathExists: 'marker.cfg' },
    scanFiles: /\.txt$/,
    matchLines: [{ match: /x/, what: 'w', fix: 'f' }],
  });
  const ruleTracked = patternRule({
    ...meta('fx-gate-tracked'),
    relevantWhen: { trackedFileMatches: /^lib\//, noTrackedFileMatches: /^vendor\// },
    scanFiles: /\.txt$/,
    matchLines: [{ match: /x/, what: 'w', fix: 'f' }],
  });
  const bare = makeRepo({ changed: { 'a.txt': 'x\n' } });
  const armed = makeRepo({ changed: { 'a.txt': 'x\n', 'marker.cfg': '1\n', 'lib/m.mjs': '1\n' } });
  const vendored = makeRepo({ changed: { 'a.txt': 'x\n', 'lib/m.mjs': '1\n', 'vendor/v.mjs': '1\n' } });
  try {
    assert.equal(ruleExists.run(ctxOf(bare)).length, 0);
    assert.equal(ruleExists.run(ctxOf(armed)).length, 1);
    assert.equal(ruleTracked.run(ctxOf(bare)).length, 0);
    assert.equal(ruleTracked.run(ctxOf(armed)).length, 1);
    assert.equal(ruleTracked.run(ctxOf(vendored)).length, 0);
  } finally { cleanup(bare); cleanup(armed); cleanup(vendored); }
});

test('relevantWhen.repoContains: findings survive only when some in-scope file carries the marker', () => {
  const rule = patternRule({
    ...meta('fx-repohas'),
    relevantWhen: { repoContains: /GOOGLE-MARK/ },
    scanFiles: /\.mjs$/,
    excludeFiles: /^skills\//,
    matchLines: [{ match: /danger/, what: 'w', fix: 'f' }],
  });
  const gated = makeRepo({ changed: { 'a.mjs': 'danger\n' } });
  const marked = makeRepo({ changed: { 'a.mjs': 'danger\n', 'conf.yml': 'GOOGLE-MARK\n' } });
  const selfMarked = makeRepo({ changed: { 'a.mjs': 'danger\n', 'skills/fixture.mjs': 'GOOGLE-MARK\n' } });
  try {
    assert.equal(rule.run(ctxOf(gated)).length, 0);
    assert.equal(rule.run(ctxOf(marked)).length, 1);
    assert.equal(rule.run(ctxOf(selfMarked)).length, 0);
  } finally { cleanup(gated); cleanup(marked); cleanup(selfMarked); }
});

test('exact-path scanFiles: whenMissing finding when declared, maxLines with {lines}/{limit}', () => {
  const rule = patternRule({
    ...meta('fx-exact'),
    scanFiles: 'DOC.md',
    whenMissing: { what: 'missing', fix: 'add it' },
    maxLines: { limit: 3, what: '{lines} lines (max {limit})', fix: 'trim' },
  });
  const absent = makeRepo({ changed: { 'other.md': 'x\n' } });
  const long = makeRepo({ changed: { 'DOC.md': 'a\nb\nc\nd\n' } });
  const short = makeRepo({ changed: { 'DOC.md': 'a\nb\n' } });
  try {
    const missing = rule.run(ctxOf(absent));
    assert.deepEqual(missing.map((f) => [f.file, f.what]), [['DOC.md', 'missing']]);
    const over = rule.run(ctxOf(long));
    assert.deepEqual(over.map((f) => [f.line, f.what]), [[4, '5 lines (max 3)']]);
    assert.equal(rule.run(ctxOf(short)).length, 0);
  } finally { cleanup(absent); cleanup(long); cleanup(short); }
});

test('scanTracked: true scans only git-tracked files; the default scanned set sees untracked too', () => {
  const trackedRule = patternRule({
    ...meta('fx-over-tracked'),
    scanFiles: /\.yml$/, scanTracked: true,
    matchLines: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const scannedRule = patternRule({
    ...meta('fx-over-scanned'),
    scanFiles: /\.yml$/,
    matchLines: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'in.yml': 'bad\n' }, uncommitted: { 'loose.yml': 'bad\n' } });
  try {
    const ctx = ctxOf(root);
    assert.deepEqual(trackedRule.run(ctx).map((f) => f.file), ['in.yml']);
    assert.deepEqual(scannedRule.run(ctx).map((f) => f.file).sort(), ['in.yml', 'loose.yml']);
  } finally { cleanup(root); }
});

test('repoWide: a match for unlessSomeFileMatches anywhere in scope silences; else each group hit is flagged at its anchor', () => {
  const rule = patternRule({
    ...meta('fx-repo-leak'),
    scanFiles: /\.mjs$/,
    repoWide: [{
      unlessSomeFileMatches: /releaseAll\(/,
      flagFilesMatching: [[/openMic\(/], [/Recognizer/, /\.start\(/]],
      neverFlagFiles: /\.test\.mjs$/,
      what: 'leaks', fix: 'release it',
    }],
  });
  const leaky = makeRepo({ changed: {
    'gum.mjs': 'setup();\nopenMic();\n',
    'rec.mjs': 'const r = new Recognizer();\nr.start();\n',
    'half.mjs': 'const r = new Recognizer();\n',
    'skip.test.mjs': 'openMic();\n',
  } });
  const released = makeRepo({ changed: {
    'gum.mjs': 'openMic();\n',
    'teardown.mjs': 'releaseAll();\n',
  } });
  try {
    const findings = rule.run(ctxOf(leaky));
    assert.deepEqual(findings.map((f) => [f.file, f.line]), [['gum.mjs', 2], ['rec.mjs', 1]]);
    assert.equal(rule.run(ctxOf(released)).length, 0);
  } finally { cleanup(leaky); cleanup(released); }
});

test('requirePaths: each declared path must exist, with {path} interpolation', () => {
  const rule = patternRule({
    ...meta('fx-require-paths'),
    requirePaths: [{ path: 'docs/PRIVACY.md', what: '{path} is missing', fix: 'create {path}' }],
  });
  const absent = makeRepo({ changed: { 'other.md': 'x\n' } });
  const present = makeRepo({ changed: { 'docs/PRIVACY.md': 'p\n' } });
  try {
    const findings = rule.run(ctxOf(absent));
    assert.deepEqual(findings.map((f) => [f.file, f.what, f.fix]),
      [['docs/PRIVACY.md', 'docs/PRIVACY.md is missing', 'create docs/PRIVACY.md']]);
    assert.equal(rule.run(ctxOf(present)).length, 0);
  } finally { cleanup(absent); cleanup(present); }
});

test('listedInFile: every captured tree name must appear in the list file as the asText token, sorted, deduped', () => {
  const rule = patternRule({
    ...meta('fx-listed'),
    listedInFile: [{
      eachTrackedPathMatching: /^mods\/(?<name>[^/]+)\/mod\.mjs$/,
      listFile: 'mods/INDEX.md',
      asText: '[{name}]',
      what: 'mod "{name}" is not listed',
      fix: 'list [{name}] in the index',
    }],
  });
  const root = makeRepo({ changed: {
    'mods/zeta/mod.mjs': '1\n',
    'mods/alpha/mod.mjs': '1\n',
    'mods/listed/mod.mjs': '1\n',
    'mods/INDEX.md': 'catalog: [listed]\n',
  } });
  const noIndex = makeRepo({ changed: { 'mods/alpha/mod.mjs': '1\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => [f.file, f.what]),
      [['mods/INDEX.md', 'mod "alpha" is not listed'], ['mods/INDEX.md', 'mod "zeta" is not listed']]);
    assert.equal(rule.run(ctxOf(noIndex)).length, 0);
  } finally { cleanup(root); cleanup(noIndex); }
});

test('coveredByGlobLine: a matching path needs a covering glob (full path or basename) on a filtered line', () => {
  const rule = patternRule({
    ...meta('fx-glob'),
    coveredByGlobLine: [{
      eachPathMatching: /(?<base>[^/]*GENERATED[^/]*)$/,
      globFile: '.gitattributes',
      globLineMatching: /\bmerge=ours\b/,
      what: 'no merge=ours entry',
      fix: 'add `{base} merge=ours`',
    }],
  });
  const uncovered = makeRepo({ changed: {
    'out/a.GENERATED.json': '{}\n',
    '.gitattributes': '# a.GENERATED.json merge=ours\nunrelated.json merge=ours\nother.json linguist-vendored\n',
  } });
  const covered = makeRepo({ changed: {
    'out/a.GENERATED.json': '{}\n',
    'b.GENERATED.md': 'x\n',
    '.gitattributes': '*.GENERATED.json merge=ours\nb.GENERATED.md merge=ours\n',
  } });
  const noGlobFile = makeRepo({ changed: { 'a.GENERATED.json': '{}\n' } });
  try {
    const findings = rule.run(ctxOf(uncovered));
    assert.deepEqual(findings.map((f) => [f.file, f.fix]),
      [['out/a.GENERATED.json', 'add `a.GENERATED.json merge=ours`']]);
    assert.equal(rule.run(ctxOf(covered)).length, 0);
    assert.equal(rule.run(ctxOf(noGlobFile)).length, 1);
  } finally { cleanup(uncovered); cleanup(covered); cleanup(noGlobFile); }
});

test('one pass: files are read once for the whole rule family, and results are cached per context', () => {
  const a = patternRule({
    ...meta('fx-pass-a'), scanFiles: /\.txt$/, matchLines: [{ match: /aa/, what: 'a', fix: 'f' }],
  });
  const b = patternRule({
    ...meta('fx-pass-b'), scanFiles: /\.txt$/, checkEachFile: [{ require: /present/, what: 'b', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'one.txt': 'aa\npresent\n', 'two.txt': 'aa\n' } });
  try {
    const ctx = ctxOf(root);
    const reads = new Map();
    const rawRead = ctx.read.bind(ctx);
    ctx.read = (path) => {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return rawRead(path);
    };
    assert.equal(a.run(ctx).length, 2);
    assert.equal(b.run(ctx).length, 1);
    assert.equal(reads.get('one.txt'), 1);
    assert.equal(reads.get('two.txt'), 1);
    const readsAfterFirstScan = [...reads.values()].reduce((s, n) => s + n, 0);
    a.run(ctx);
    b.run(ctx);
    assert.equal([...reads.values()].reduce((s, n) => s + n, 0), readsAfterFirstScan);
  } finally { cleanup(root); }
});

test('excludeFiles removes files from scope (regex or exact path)', () => {
  const rule = patternRule({
    ...meta('fx-exclude'),
    scanFiles: /\.yml$/, excludeFiles: 'ops/skip.yml',
    matchLines: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'ops/skip.yml': 'bad\n', 'ops/keep.yml': 'bad\n' } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => f.file), ['ops/keep.yml']);
  } finally { cleanup(root); }
});

test('a fresh context is a fresh scan — the cache never bleeds between repos', () => {
  const rule = patternRule({
    ...meta('fx-fresh'), scanFiles: /\.txt$/, matchLines: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const dirty = makeRepo({ changed: { 'a.txt': 'bad\n' } });
  const clean = makeRepo({ changed: { 'a.txt': 'fine\n' } });
  try {
    assert.equal(rule.run(ctxOf(dirty)).length, 1);
    assert.equal(rule.run(ctxOf(clean)).length, 0);
    writeFiles(dirty, { 'b.txt': 'bad\n' });
    assert.equal(rule.run(ctxOf(dirty)).length, 2);
  } finally { cleanup(dirty); cleanup(clean); }
});
