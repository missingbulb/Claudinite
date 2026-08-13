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

test('line assertions: match + unlessLine, {match} templating, 1-indexed anchor', () => {
  const rule = patternRule({
    ...meta('fx-line'),
    files: /\.txt$/,
    line: [{ match: /TOK_\w+/, unlessLine: /allowed/, what: 'saw {match}', fix: 'remove it' }],
  });
  const root = makeRepo({ changed: { 'a.txt': 'clean\nTOK_ONE\nTOK_TWO allowed\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
    assert.equal(findings[0].what, 'saw TOK_ONE');
  } finally { cleanup(root); }
});

test('line assertions: first matching assertion wins per line; skipLines hides a line', () => {
  const rule = patternRule({
    ...meta('fx-first-wins'),
    files: /\.txt$/,
    skipLines: /^#/,
    line: [
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

test('line assertions: when (all-of) and unlessFile scope by the file\'s whole text', () => {
  const rule = patternRule({
    ...meta('fx-when'),
    files: /\.txt$/,
    line: [{ match: /hit/, when: [/armed/, /live/], unlessFile: /disarmed/, what: 'w', fix: 'f' }],
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

test('file assertions: if-list + require / forbid, one finding per file, no line anchor', () => {
  const rule = patternRule({
    ...meta('fx-file'),
    files: /\.yml$/,
    file: [
      { if: [/uses: deploy/, /root: true/], require: /pruned/, what: 'unpruned', fix: 'f' },
      { if: /uses: deploy/, forbid: /insecure/, what: 'insecure', fix: 'f' },
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

test('gates: exists / notExists / tracked / notTracked, rule-level and per-assertion', () => {
  const ruleExists = patternRule({
    ...meta('fx-gate-exists'),
    gate: { exists: 'marker.cfg' },
    files: /\.txt$/,
    line: [{ match: /x/, what: 'w', fix: 'f' }],
  });
  const ruleTracked = patternRule({
    ...meta('fx-gate-tracked'),
    gate: { tracked: /^lib\//, notTracked: /^vendor\// },
    files: /\.txt$/,
    line: [{ match: /x/, what: 'w', fix: 'f' }],
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

test('gate.repoHas: findings survive only when some in-scope file carries the marker', () => {
  const rule = patternRule({
    ...meta('fx-repohas'),
    gate: { repoHas: /GOOGLE-MARK/ },
    files: /\.mjs$/,
    exclude: /^skills\//,
    line: [{ match: /danger/, what: 'w', fix: 'f' }],
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

test('exact-path files: missing finding when declared, maxLines with {lines}/{limit}', () => {
  const rule = patternRule({
    ...meta('fx-exact'),
    files: 'DOC.md',
    missing: { what: 'missing', fix: 'add it' },
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

test('over: tracked scans only git-tracked files; the default scanned set sees untracked too', () => {
  const trackedRule = patternRule({
    ...meta('fx-over-tracked'),
    files: /\.yml$/, over: 'tracked',
    line: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const scannedRule = patternRule({
    ...meta('fx-over-scanned'),
    files: /\.yml$/,
    line: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'in.yml': 'bad\n' }, uncommitted: { 'loose.yml': 'bad\n' } });
  try {
    const ctx = ctxOf(root);
    assert.deepEqual(trackedRule.run(ctx).map((f) => f.file), ['in.yml']);
    assert.deepEqual(scannedRule.run(ctx).map((f) => f.file).sort(), ['in.yml', 'loose.yml']);
  } finally { cleanup(root); }
});

test('repo assertions: require anywhere in scope silences; else flags each group hit at its anchor', () => {
  const spec = {
    files: /\.mjs$/,
    repo: [{
      require: /releaseAll\(/,
      flag: [[/openMic\(/], [/Recognizer/, /\.start\(/]],
      excludeFlagged: /\.test\.mjs$/,
      what: 'leaks', fix: 'release it',
    }],
  };
  const leakRule = patternRule({ ...meta('fx-repo-leak'), ...spec });
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
    const findings = leakRule.run(ctxOf(leaky));
    assert.deepEqual(findings.map((f) => [f.file, f.line]), [['gum.mjs', 2], ['rec.mjs', 1]]);
    assert.equal(leakRule.run(ctxOf(released)).length, 0);
  } finally { cleanup(leaky); cleanup(released); }
});

test('one pass: files are read once for the whole rule family, and results are cached per context', () => {
  const a = patternRule({
    ...meta('fx-pass-a'), files: /\.txt$/, line: [{ match: /aa/, what: 'a', fix: 'f' }],
  });
  const b = patternRule({
    ...meta('fx-pass-b'), files: /\.txt$/, file: [{ require: /present/, what: 'b', fix: 'f' }],
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

test('exclude removes files from scope (regex or exact path)', () => {
  const rule = patternRule({
    ...meta('fx-exclude'),
    files: /\.yml$/, exclude: 'ops/skip.yml',
    line: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'ops/skip.yml': 'bad\n', 'ops/keep.yml': 'bad\n' } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => f.file), ['ops/keep.yml']);
  } finally { cleanup(root); }
});

test('a fresh context is a fresh scan — the cache never bleeds between repos', () => {
  const rule = patternRule({
    ...meta('fx-fresh'), files: /\.txt$/, line: [{ match: /bad/, what: 'w', fix: 'f' }],
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
