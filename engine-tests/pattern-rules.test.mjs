import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, writeFiles, ruleTester } from './helpers.mjs';
import { buildContext } from '../engine/checks/helpers/repo-context.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patternRule, loadDeclaredChecks } from '../engine/checks/helpers/pattern-rules.mjs';

// The declarative engine's own contract, proven over fixture rules — the pack
// declarations built on it are proven by their packs' existing tests.
const ctxOf = (root) => buildContext({ root, mode: 'all' });
const meta = (id) => ({ id, severity: 'blocking', failureMessage: `fixture ${id} matters` });

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

test('checkParsedFile: whenFieldPresent + requireField / forbidField over the parsed document', () => {
  const rule = patternRule({
    ...meta('fx-parsed-file'),
    checkParsedFile: [{
      file: 'package.json',
      whenFieldPresent: 'devDependencies.esbuild',
      requireField: 'dependencies.esbuild',
      what: 'dev-only', fix: 'move it',
    }],
  });
  const bad = makeRepo({ changed: { 'package.json': '{"devDependencies":{"esbuild":"1"}}' } });
  const good = makeRepo({ changed: { 'package.json': '{"devDependencies":{"esbuild":"1"},"dependencies":{"esbuild":"1"}}' } });
  const inert = makeRepo({ changed: { 'package.json': '{"dependencies":{"other":"1"}}' } });
  const broken = makeRepo({ changed: { 'package.json': '{not json' } });
  try {
    assert.deepEqual(rule.run(ctxOf(bad)).map((f) => [f.file, f.what]), [['package.json', 'dev-only']]);
    assert.equal(rule.run(ctxOf(good)).length, 0);
    assert.equal(rule.run(ctxOf(inert)).length, 0);
    assert.equal(rule.run(ctxOf(broken)).length, 0);
  } finally { cleanup(bad); cleanup(good); cleanup(inert); cleanup(broken); }
});

test('equalParsedValues: first file found by path+content probe; missing second and mismatch each fire their message', () => {
  const rule = patternRule({
    ...meta('fx-equal-values'),
    equalParsedValues: [{
      first: { filesMatching: /manifest\.json$/, whereFileContains: /"manifest_version"/, field: 'version' },
      second: { file: 'package.json', field: 'version' },
      whenSecondMissing: { what: 'no package.json', fix: 'add it' },
      whenUnequal: { what: 'versions differ: {first} vs {second}', fix: 'align them' },
    }],
  });
  const mismatched = makeRepo({ changed: {
    'app/manifest.json': '{"manifest_version":3,"version":"1.2.3"}',
    'package.json': '{"version":"9.9.9"}',
  } });
  const missing = makeRepo({ changed: { 'app/manifest.json': '{"manifest_version":3,"version":"1.2.3"}' } });
  const equal = makeRepo({ changed: {
    'app/manifest.json': '{"manifest_version":3,"version":"1.2.3"}',
    'package.json': '{"version":"1.2.3"}',
  } });
  const noManifest = makeRepo({ changed: { 'package.json': '{"version":"9.9.9"}' } });
  try {
    const findings = rule.run(ctxOf(mismatched));
    assert.deepEqual(findings.map((f) => [f.file, f.what]),
      [['app/manifest.json', 'versions differ: 1.2.3 vs 9.9.9']]);
    assert.deepEqual(rule.run(ctxOf(missing)).map((f) => [f.file, f.what]), [['package.json', 'no package.json']]);
    assert.equal(rule.run(ctxOf(equal)).length, 0);
    assert.equal(rule.run(ctxOf(noManifest)).length, 0);
  } finally { cleanup(mismatched); cleanup(missing); cleanup(equal); cleanup(noManifest); }
});

test('forEachParsedEntry: YAML entries filtered by field equality; array containment case-insensitive; {entry} interpolates', () => {
  const rule = patternRule({
    ...meta('fx-parsed-entry'),
    forEachParsedEntry: [{
      inFilesMatching: /(^|\/)template\.ya?ml$/,
      entriesAtField: 'Resources',
      whereFieldEquals: { field: 'Type', equals: 'Custom::Policy' },
      forbidValueInArray: { atField: 'Properties.Headers', value: 'authorization', ignoreCase: true },
      what: '{entry} forwards Authorization', fix: 'drop it',
    }],
  });
  const bad = makeRepo({ changed: { 'template.yaml':
`Resources:
  MyPolicy:
    Type: Custom::Policy
    Properties:
      Headers:
        - Origin
        - Authorization
  OtherThing:
    Type: Other::Type
    Properties:
      Headers:
        - Authorization
` } });
  const clean = makeRepo({ changed: { 'template.yaml':
`Resources:
  MyPolicy:
    Type: Custom::Policy
    Properties:
      Headers:
        - Origin
` } });
  try {
    const findings = rule.run(ctxOf(bad));
    assert.deepEqual(findings.map((f) => [f.file, f.what]), [['template.yaml', 'MyPolicy forwards Authorization']]);
    assert.equal(rule.run(ctxOf(clean)).length, 0);
  } finally { cleanup(bad); cleanup(clean); }
});

test('checkKeyValueFile: missing file, malformed line, unknown key, and missing key each fire their message', () => {
  const rule = patternRule({
    ...meta('fx-keyvalue'),
    checkKeyValueFile: [{
      file: 'app.config',
      keys: ['alpha', 'beta'],
      whenMissing: { what: 'missing (needs {keys})', fix: 'create it' },
      whenLineNotKeyValue: { what: 'bad line "{line}"', fix: 'KEY=value only' },
      whenKeyUnknown: { what: 'unknown "{key}"', fix: 'valid: {keys}' },
      whenKeyMissing: { what: 'missing "{key}"', fix: 'add {key}=' },
    }],
  });
  const absent = makeRepo({ changed: { 'other.txt': 'x\n' } });
  const messy = makeRepo({ changed: { 'app.config': '# comment\nalpha=1\nnot a pair\ngamma=3\n' } });
  const clean = makeRepo({ changed: { 'app.config': 'alpha=1\nbeta=\n' } });
  try {
    assert.deepEqual(rule.run(ctxOf(absent)).map((f) => f.what), ['missing (needs alpha, beta)']);
    assert.deepEqual(rule.run(ctxOf(messy)).map((f) => [f.line, f.what]), [
      [3, 'bad line "not a pair"'],
      [4, 'unknown "gamma"'],
      [null, 'missing "beta"'],
    ]);
    assert.equal(rule.run(ctxOf(clean)).length, 0);
  } finally { cleanup(absent); cleanup(messy); cleanup(clean); }
});

test('relevantWhen: someTrackedFileContains and exactlyOneTrackedFileMatches gate the rule', () => {
  const rule = patternRule({
    ...meta('fx-parsed-gates'),
    relevantWhen: {
      someTrackedFileContains: { pathMatching: /\.yaml$/, text: /BuildMethod: esbuild/ },
      exactlyOneTrackedFileMatches: /(^|\/)package\.json$/,
    },
    checkParsedFile: [{
      file: 'package.json', whenFieldPresent: 'devDependencies.esbuild',
      requireField: 'dependencies.esbuild', what: 'w', fix: 'f',
    }],
  });
  const armed = makeRepo({ changed: {
    't.yaml': 'BuildMethod: esbuild\n',
    'package.json': '{"devDependencies":{"esbuild":"1"}}',
  } });
  const noMarker = makeRepo({ changed: { 'package.json': '{"devDependencies":{"esbuild":"1"}}' } });
  const twoPackages = makeRepo({ changed: {
    't.yaml': 'BuildMethod: esbuild\n',
    'package.json': '{"devDependencies":{"esbuild":"1"}}',
    'svc/package.json': '{}',
  } });
  try {
    assert.equal(rule.run(ctxOf(armed)).length, 1);
    assert.equal(rule.run(ctxOf(noMarker)).length, 0);
    assert.equal(rule.run(ctxOf(twoPackages)).length, 0);
  } finally { cleanup(armed); cleanup(noMarker); cleanup(twoPackages); }
});

test('parsed documents are parsed once per scan across the rule family', () => {
  const a = patternRule({
    ...meta('fx-parse-once-a'),
    checkParsedFile: [{ file: 'shared.json', requireField: 'alpha', what: 'a', fix: 'f' }],
  });
  const b = patternRule({
    ...meta('fx-parse-once-b'),
    checkParsedFile: [{ file: 'shared.json', requireField: 'beta', what: 'b', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'shared.json': '{"alpha":1}' } });
  try {
    const ctx = ctxOf(root);
    const reads = new Map();
    const rawRead = ctx.read.bind(ctx);
    ctx.read = (path) => {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return rawRead(path);
    };
    assert.equal(a.run(ctx).length, 0);
    assert.equal(b.run(ctx).length, 1);
    assert.equal(reads.get('shared.json'), 1);
  } finally { cleanup(root); }
});

test('checkSections: requirePresent honors fences, case, and heading suffix words; {section} interpolates', () => {
  const rule = patternRule({
    ...meta('fx-sections-present'),
    scanFiles: /(^|\/)page\.md$/,
    checkSections: [{
      sections: ['Alpha', 'Beta'],
      requirePresent: { what: 'missing "## {section}"', fix: 'add {section}' },
    }],
  });
  const root = makeRepo({ changed: { 'page.md':
'# Title\n\n## alpha notes\n\ntext\n\n```\n## Beta\n```\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => f.what), ['missing "## Beta"']);
  } finally { cleanup(root); }
});

test('checkSections: requireFirstOnPage and forbidProseLines (continuations and blanks are not prose)', () => {
  const rule = patternRule({
    ...meta('fx-sections-first'),
    scanFiles: /\.md$/,
    checkSections: [{
      section: 'Summary',
      requireFirstOnPage: { what: 'opens with "## {first}"', fix: 'move it up' },
      forbidProseLines: { what: 'prose: "{line}"', fix: 'bullets only' },
    }],
  });
  const root = makeRepo({ changed: { 'page.md':
'# Title\n\n## History\n\nold\n\n## Summary\n\n- fine bullet\n  wrapped continuation\n\nloose sentence\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => f.what), ['opens with "## History"', 'prose: "loose sentence"']);
    assert.equal(findings[1].line, 12);
  } finally { cleanup(root); }
});

test('checkSections: eachBulletBlockMatches judges the bullet plus its continuations as one block', () => {
  const rule = patternRule({
    ...meta('fx-sections-block'),
    scanFiles: /\.md$/,
    checkSections: [{
      section: 'Sources',
      eachBulletBlockMatches: { pattern: /https?:\/\//, what: 'no URL: "{bullet}"', fix: 'cite it' },
    }],
  });
  const root = makeRepo({ changed: { 'page.md':
'## Sources\n\n- wrapped source\n  https://example.com\n- bare claim with no link\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => [f.line, f.what]), [[5, 'no URL: "- bare claim with no link"']]);
  } finally { cleanup(root); }
});

test('checkSections: eachBulletLeadsWithDate flags undated bullets and impossible calendar dates', () => {
  const rule = patternRule({
    ...meta('fx-sections-dated'),
    scanFiles: /\.md$/,
    checkSections: [{
      section: 'Log',
      eachBulletLeadsWithDate: {
        whenUndated: { what: 'undated: "{bullet}"', fix: 'date it' },
        whenNotRealDate: { what: '"{date}" is not real', fix: 'fix it' },
      },
      minBullets: { count: 1, what: 'empty log', fix: 'seed it' },
    }],
  });
  const messy = makeRepo({ changed: { 'page.md':
'## Log\n\n- **2026-07-15** fine\n- 2026-02-30 rolled over\n- no date here\n' } });
  const empty = makeRepo({ changed: { 'page.md': '## Log\n\nprose only\n' } });
  try {
    const findings = rule.run(ctxOf(messy));
    assert.deepEqual(findings.map((f) => f.what), ['"2026-02-30" is not real', 'undated: "- no date here"']);
    assert.deepEqual(rule.run(ctxOf(empty)).map((f) => f.what), ['empty log']);
  } finally { cleanup(messy); cleanup(empty); }
});

test('checkSections: maxBullets and maxBulletBlockLength cap the list; min wins over max at zero', () => {
  const rule = patternRule({
    ...meta('fx-sections-caps'),
    scanFiles: /\.md$/,
    checkSections: [{
      section: 'Summary',
      minBullets: { count: 1, what: 'no bullets', fix: 'add one' },
      maxBullets: { count: 2, what: '{bullets} bullets (max 2)', fix: 'trim' },
      maxBulletBlockLength: { characters: 30, what: '{characters} chars: "{bullet}…"', fix: 'shorten' },
    }],
  });
  const over = makeRepo({ changed: { 'page.md':
`## Summary\n\n- one\n- two\n- a bullet that runs well past the thirty character ceiling\n` } });
  try {
    const findings = rule.run(ctxOf(over));
    assert.equal(findings[0].what, '59 chars: "- a bullet that runs well past the thirty character ceiling…"');
    assert.equal(findings[1].what, '3 bullets (max 2)');
  } finally { cleanup(over); }
});

test('checkSections: newestDatedBulletWithinDays uses ctx.now, discards far-future dates, and respects the boundary', () => {
  const rule = patternRule({
    ...meta('fx-sections-fresh'),
    relevantWhen: { scanningWholeRepo: true },
    scanFiles: /\.md$/,
    checkSections: [{
      section: 'Log',
      newestDatedBulletWithinDays: { days: 45, what: '{age} days old ({date}), window {days}', fix: 'refresh' },
    }],
  });
  const NOW = Date.UTC(2026, 6, 1); // 2026-07-01
  const page = (entry) => makeRepo({ changed: { 'page.md': `## Log\n\n- ${entry} x\n` } });
  const onWindow = page('2026-05-17');   // exactly 45 days before NOW
  const stale = page('2026-05-16');      // 46 days
  const typoFuture = makeRepo({ changed: { 'page.md':
    '## Log\n\n- 2026-05-16 stale x\n- 2099-01-01 typo x\n' } }); // the future typo is discarded, so the stale entry still fires
  try {
    const at = (root) => { const ctx = ctxOf(root); ctx.now = NOW; return rule.run(ctx); };
    assert.equal(at(onWindow).length, 0);
    assert.deepEqual(at(stale).map((f) => f.what), ['46 days old (2026-05-16), window 45']);
    assert.deepEqual(at(typoFuture).map((f) => f.what), ['46 days old (2026-05-16), window 45']);
  } finally { cleanup(onWindow); cleanup(stale); cleanup(typoFuture); }
});

test('relevantWhen.scanningWholeRepo: the rule is inert under a --changed run', () => {
  const rule = patternRule({
    ...meta('fx-whole-repo-gate'),
    relevantWhen: { scanningWholeRepo: true },
    scanFiles: /\.md$/,
    matchLines: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'a.md': 'bad\n' } });
  try {
    assert.equal(rule.run(buildContext({ root, mode: 'all' })).length, 1);
    assert.equal(rule.run(buildContext({ root, mode: 'changed' })).length, 0);
  } finally { cleanup(root); }
});

// --- the JSON declaration surface --------------------------------------------

test('a declaration is JSON: /pattern/flags strings compile, other strings stay literal', () => {
  const rule = patternRule(JSON.parse(JSON.stringify({
    id: 'fx-json', severity: 'blocking', failureMessage: 'json rules load',
    scanFiles: 'a.txt',
    matchLines: [{ match: '/^\\s*BAD/m', what: 'saw {match}', fix: 'f' }],
  })));
  assert.ok(rule.spec.matchLines[0].match instanceof RegExp);
  assert.equal(rule.spec.matchLines[0].match.flags, 'm');
  assert.equal(rule.spec.scanFiles, 'a.txt');
  const root = makeRepo({ changed: { 'a.txt': 'fine\n  BAD line\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
  } finally { cleanup(root); }
});

test('failureMessage is what the finding says; a declaration carries no description or doc', () => {
  const rule = patternRule({
    ...meta('fx-message'),
    scanFiles: /\.txt$/,
    matchLines: [{ match: /bad/, what: 'w', fix: 'f' }],
  });
  assert.equal(rule.why, 'fixture fx-message matters');
  assert.equal(rule.description, undefined);
  assert.equal(rule.doc, undefined);
  const root = makeRepo({ changed: { 'a.txt': 'bad\n' } });
  try {
    const [f] = rule.run(ctxOf(root));
    assert.equal(f.why, 'fixture fx-message matters');
    assert.equal(f.doc, undefined);
  } finally { cleanup(root); }
});

test('a pattern key given a plain string names the key and the value it got', () => {
  assert.throws(
    () => patternRule({ ...meta('fx-bad-pattern'), scanFiles: /\.txt$/, matchLines: [{ match: 'bad', what: 'w', fix: 'f' }] }),
    /"match" takes a regex in \/pattern\/flags form, not "bad"/,
  );
  assert.throws(
    () => patternRule({ ...meta('fx-bad-regex'), scanFiles: '/[unterminated/' }),
    /"scanFiles" is not a valid regex/,
  );
});

test('checkParsedFiles: one selector serves every parsed assertion — requireField over matching files', () => {
  const rule = patternRule({
    ...meta('fx-parsed-merged-require'),
    checkParsedFiles: [{
      filesMatching: /(^|\/)wrangler\.json$/,
      whenFieldPresent: 'routes',
      requireField: 'account_id',
      what: 'routes without account_id', fix: 'add it',
    }],
  });
  const bad = makeRepo({ changed: { 'svc/wrangler.json': '{"routes":["a"]}' } });
  const good = makeRepo({ changed: { 'svc/wrangler.json': '{"routes":["a"],"account_id":"x"}' } });
  try {
    assert.deepEqual(rule.run(ctxOf(bad)).map((f) => [f.file, f.what]), [['svc/wrangler.json', 'routes without account_id']]);
    assert.equal(rule.run(ctxOf(good)).length, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('checkParsedFiles: forEachEntryAtField quantifies any assertion per entry — requireField per entry', () => {
  const rule = patternRule({
    ...meta('fx-parsed-merged-entries'),
    checkParsedFiles: [{
      filesMatching: /(^|\/)template\.ya?ml$/,
      forEachEntryAtField: 'Resources',
      whereEntryFieldEquals: { field: 'Type', equals: 'AWS::Serverless::Function' },
      requireField: 'Properties.Timeout',
      what: '{entry} declares no Timeout', fix: 'set one',
    }],
  });
  const root = makeRepo({ changed: { 'template.yaml':
`Resources:
  FnA:
    Type: AWS::Serverless::Function
    Properties:
      Handler: a.run
  FnB:
    Type: AWS::Serverless::Function
    Properties:
      Timeout: 30
  Bucket:
    Type: AWS::S3::Bucket
` } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => f.what), ['FnA declares no Timeout']);
  } finally { cleanup(root); }
});

test('checkParsedFiles: requireEqualFields carries the version-sync shape with {first}/{second}', () => {
  const rule = patternRule({
    ...meta('fx-parsed-merged-equal'),
    checkParsedFiles: [{
      filesMatching: /manifest\.json$/,
      whereFileContains: /"manifest_version"/,
      requireEqualFields: {
        field: 'version',
        inFile: 'package.json',
        atField: 'version',
        whenFileMissing: { what: 'no package.json', fix: 'add it' },
        whenUnequal: { what: '{first} vs {second}', fix: 'align' },
      },
    }],
  });
  const mismatched = makeRepo({ changed: {
    'app/manifest.json': '{"manifest_version":3,"version":"1.2.3"}',
    'package.json': '{"version":"9.9.9"}',
  } });
  const missing = makeRepo({ changed: { 'app/manifest.json': '{"manifest_version":3,"version":"1.2.3"}' } });
  try {
    assert.deepEqual(rule.run(ctxOf(mismatched)).map((f) => [f.file, f.what]), [['app/manifest.json', '1.2.3 vs 9.9.9']]);
    assert.deepEqual(rule.run(ctxOf(missing)).map((f) => [f.file, f.what]), [['package.json', 'no package.json']]);
  } finally { cleanup(mismatched); cleanup(missing); }
});

test('requireIndexCoverage: coveredByText anchored at the index file — the listedInFile shape', () => {
  const rule = patternRule({
    ...meta('fx-coverage-text'),
    requireIndexCoverage: [{
      eachTrackedPathMatching: /^mods\/(?<name>[^/]+)\/mod\.mjs$/,
      indexFile: 'mods/INDEX.md',
      coveredByText: '[{name}]',
      whenIndexFileAbsent: 'assertNothing',
      anchorFindingsAt: 'indexFile',
      what: 'mod "{name}" is not listed', fix: 'list it',
    }],
  });
  const root = makeRepo({ changed: {
    'mods/zeta/mod.mjs': '1\n', 'mods/alpha/mod.mjs': '1\n', 'mods/INDEX.md': '[alpha]\n',
  } });
  const noIndex = makeRepo({ changed: { 'mods/alpha/mod.mjs': '1\n' } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => [f.file, f.what]), [['mods/INDEX.md', 'mod "zeta" is not listed']]);
    assert.equal(rule.run(ctxOf(noIndex)).length, 0);
  } finally { cleanup(root); cleanup(noIndex); }
});

test('requireIndexCoverage: coveredByGlobLinesMatching anchored per path, absence flags — the merge-driver shape', () => {
  const rule = patternRule({
    ...meta('fx-coverage-glob'),
    requireIndexCoverage: [{
      eachScannedPathMatching: /(?<base>[^/]*GENERATED[^/]*)$/,
      includeVendored: true,
      indexFile: '.gitattributes',
      coveredByGlobLinesMatching: /\bmerge=ours\b/,
      whenIndexFileAbsent: 'flagEveryPath',
      anchorFindingsAt: 'eachUncoveredPath',
      what: 'no merge=ours entry', fix: 'add `{base} merge=ours`',
    }],
  });
  const covered = makeRepo({ changed: {
    'out/a.GENERATED.json': '{}\n', '.gitattributes': '*.GENERATED.json merge=ours\n',
  } });
  const absent = makeRepo({ changed: { 'a.GENERATED.json': '{}\n' } });
  try {
    assert.equal(rule.run(ctxOf(covered)).length, 0);
    assert.deepEqual(rule.run(ctxOf(absent)).map((f) => [f.file, f.fix]),
      [['a.GENERATED.json', 'add `a.GENERATED.json merge=ours`']]);
  } finally { cleanup(covered); cleanup(absent); }
});

test('forbidReferences: a declared barrier edge rides the shared engine, with the rule-level fix as the crossing remedy', () => {
  const rule = patternRule({
    ...meta('fx-barrier'),
    fix: 'the declared remedy',
    relevantWhen: { pathExists: 'guarded' },
    forbidReferences: [{ from: 'guarded', to: 'barred', reason: 'stay apart' }],
  });
  const crossing = makeRepo({ changed: {
    'guarded/a.mjs': "import x from '../barred/thing.mjs';\n",
    'barred/thing.mjs': 'export default 1;\n',
  } });
  const clean = makeRepo({ changed: {
    'guarded/a.mjs': 'const ok = 1;\n',
    'barred/thing.mjs': 'export default 1;\n',
  } });
  try {
    const findings = rule.run(ctxOf(crossing));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'guarded/a.mjs');
    assert.match(findings[0].what, /barred\/thing\.mjs/);
    assert.equal(findings[0].fix, 'the declared remedy');
    assert.equal(findings[0].why, 'stay apart');
    assert.equal(rule.run(ctxOf(clean)).length, 0);
  } finally { cleanup(crossing); cleanup(clean); }
});

test('forbidReferences: a malformed edge is an authoring error at load', () => {
  assert.throws(
    () => patternRule({ ...meta('fx-barrier-bad'), forbidReferences: [{ from: 'a' }] }),
    /"to"/,
  );
});

test('an unknown spec key is an authoring error naming the key and its container', () => {
  assert.throws(
    () => patternRule({ ...meta('fx-unknown-top'), scanFiles: /\.txt$/, matchLine: [] }),
    /"matchLine" is not a spec key.*matchLines/s,
  );
  assert.throws(
    () => patternRule({
      ...meta('fx-unknown-nested'), scanFiles: /\.txt$/,
      matchLines: [{ match: /x/, unlesLineMatches: /y/, what: 'w', fix: 'f' }],
    }),
    /"unlesLineMatches" is not a key of "matchLines"/,
  );
  assert.throws(
    () => patternRule({ id: 'fx-bad-severity', severity: 'fatal', failureMessage: 'm', scanFiles: /\.txt$/ }),
    /severity/,
  );
});

test('scanFileClasses and excludeFileClasses name shared file sets; an unknown class is an authoring error', () => {
  const rule = patternRule({
    ...meta('fx-classes'),
    scanFileClasses: ['javascriptFiles', 'pythonFiles'],
    excludeFileClasses: ['testFiles'],
    matchLines: [{ match: /danger/, what: 'w', fix: 'f' }],
  });
  const root = makeRepo({ changed: {
    'src/a.mjs': 'danger\n',
    'src/b.py': 'danger\n',
    'src/a.test.mjs': 'danger\n',
    '__tests__/c.mjs': 'danger\n',
    'notes.md': 'danger\n',
  } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => f.file).sort(), ['src/a.mjs', 'src/b.py']);
  } finally { cleanup(root); }
  assert.throws(
    () => patternRule({ ...meta('fx-bad-class'), scanFileClasses: ['sourceFiles'] }),
    /"sourceFiles" is not a file class.*javascriptFiles/s,
  );
});

test('a rule-level fix is the default for every assertion missing its own', () => {
  const rule = patternRule({
    ...meta('fx-fix-default'),
    fix: 'the one shared remedy',
    scanFiles: /\.txt$/,
    matchLines: [
      { match: /alpha/, what: 'a' },
      { match: /beta/, what: 'b', fix: 'a bespoke remedy' },
    ],
  });
  const root = makeRepo({ changed: { 'a.txt': 'alpha\nbeta\n' } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => [f.what, f.fix]),
      [['a', 'the one shared remedy'], ['b', 'a bespoke remedy']]);
  } finally { cleanup(root); }
});

test('scanIgnoringComments: comments are invisible to content assertions, strings are not, lines stay anchored', () => {
  const rule = patternRule({
    ...meta('fx-strip'),
    scanFiles: /\.mjs$/,
    scanIgnoringComments: true,
    matchLines: [{ match: /forbiddenCall\(/, what: 'saw {match}', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'a.mjs':
    '// forbiddenCall() in a comment\n/* forbiddenCall() in a block */\nconst u = "https://x//forbiddenCall(";\nforbiddenCall();\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => f.line), [3, 4]);
  } finally { cleanup(root); }
});

test('a skill\'s declared checks never scan the skill\'s own content, wherever it is mounted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'declared-skill-'));
  try {
    const skillDir = join(dir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'declared-checks.json'), JSON.stringify([
      { id: 'fx-self-exclude', severity: 'blocking', failureMessage: 'm',
        scanFiles: '/\\.md$/', matchLines: [{ match: '/badToken/', what: 'w', fix: 'f' }] },
    ]));
    const [rule] = loadDeclaredChecks(skillDir);
    const root = makeRepo({ changed: {
      'skills/my-skill/SKILL.md': 'badToken\n',
      'packs/p/skills/my-skill/SKILL.md': 'badToken\n',
      'docs/real.md': 'badToken\n',
    } });
    try {
      assert.deepEqual(rule.run(ctxOf(root)).map((f) => f.file), ['docs/real.md']);
    } finally { cleanup(root); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadDeclaredChecks: a directory\'s declarations, compiled once; none where the file is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'declared-checks-'));
  try {
    assert.deepEqual(loadDeclaredChecks(join(dir, 'empty')), []);
    writeFileSync(join(dir, 'declared-checks.json'), JSON.stringify([
      { id: 'fx-declared-a', severity: 'advisory', failureMessage: 'a', scanFiles: '/\\.txt$/', matchLines: [{ match: '/bad/', what: 'w', fix: 'f' }] },
      { id: 'fx-declared-b', severity: 'blocking', failureMessage: 'b', scanFiles: 'CLAUDE.md', maxLines: { limit: 1, what: '{lines}', fix: 'f' } },
    ]));
    const rules = loadDeclaredChecks(dir);
    assert.deepEqual(rules.map((r) => r.id), ['fx-declared-a', 'fx-declared-b']);
    assert.deepEqual(rules.map((r) => r.severity), ['advisory', 'blocking']);
    // Compiled once: a second read hands back the same rule objects, so the
    // registry and a test asking for the same declaration share one scan.
    assert.equal(loadDeclaredChecks(dir)[0], rules[0]);
    const root = makeRepo({ changed: { 'a.txt': 'bad\n' } });
    try {
      assert.deepEqual(rules[0].run(ctxOf(root)).map((f) => f.file), ['a.txt']);
    } finally { cleanup(root); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scanIgnoringMarkdownFences: fenced blocks are invisible in markdown files, untouched elsewhere, lines stay anchored', () => {
  const rule = patternRule({
    ...meta('fx-fence-blind'),
    scanFiles: /\.(md|txt)$/,
    scanIgnoringMarkdownFences: true,
    matchLines: [{ match: /badToken/, what: 'saw {match}', fix: 'f' }],
  });
  const root = makeRepo({ changed: {
    'page.md': 'prose\n```\nbadToken in a fence\n```\nbadToken outside\n',
    'plain.txt': '```\nbadToken between backticks, but not markdown\n```\n',
  } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => [f.file, f.line]),
      [['page.md', 5], ['plain.txt', 2]]);
  } finally { cleanup(root); }
});

test('scanIgnoringMarkdownFences: a require satisfied only inside a fence still fires checkEachFile', () => {
  const rule = patternRule({
    ...meta('fx-fence-require'),
    scanFiles: /^docs\/.+\.md$/,
    scanIgnoringMarkdownFences: true,
    checkEachFile: [{ require: /## Setup/, what: 'no Setup section', fix: 'f' }],
  });
  const root = makeRepo({ changed: {
    'docs/fenced.md': 'an example:\n```\n## Setup\n```\n',
    'docs/real.md': '## Setup\nsteps\n',
  } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => f.file), ['docs/fenced.md']);
  } finally { cleanup(root); }
});

test('countMatchingLines: atMost anchors at the first line past the bound, atLeast fires at file level, in-bounds is silent', () => {
  const rule = patternRule({
    ...meta('fx-count'),
    scanFiles: /\.yml$/,
    countMatchingLines: [
      { linesMatching: /^ {4}- cron:/, atLeast: 1, atMost: 2,
        what: '{count} cron lines (between {atLeast} and {atMost})', fix: 'f' },
    ],
  });
  const root = makeRepo({ changed: {
    'many.yml': 'on:\n  schedule:\n    - cron: a\n    - cron: b\n    - cron: c\n',
    'none.yml': 'on: push\n',
    'fine.yml': 'on:\n  schedule:\n    - cron: a\n',
  } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => [f.file, f.line, f.what]).sort(), [
      ['many.yml', 5, '3 cron lines (between 1 and 2)'],
      ['none.yml', null, '0 cron lines (between 1 and 2)'],
    ]);
  } finally { cleanup(root); }
});

test('countMatchingLines: atMost 0 forbids, counting reads the comment-blanked view under scanIgnoringComments', () => {
  const rule = patternRule({
    ...meta('fx-count-forbid'),
    scanFiles: /\.mjs$/,
    scanIgnoringComments: true,
    countMatchingLines: [{ linesMatching: /eval\(/, atMost: 0, what: '{count} eval calls', fix: 'f' }],
  });
  const root = makeRepo({ changed: {
    'clean.mjs': '// eval() only in a comment\nconst x = 1;\n',
    'dirty.mjs': '// eval() in a comment\neval("x");\n',
  } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => [f.file, f.line]), [['dirty.mjs', 2]]);
  } finally { cleanup(root); }
});

test('countMatchingLines: a boundless or backwards entry is an authoring error at load', () => {
  assert.throws(() => patternRule({
    ...meta('fx-count-boundless'),
    scanFiles: /\.yml$/,
    countMatchingLines: [{ linesMatching: /x/, what: 'w', fix: 'f' }],
  }), /atLeast|atMost/);
  assert.throws(() => patternRule({
    ...meta('fx-count-backwards'),
    scanFiles: /\.yml$/,
    countMatchingLines: [{ linesMatching: /x/, atLeast: 3, atMost: 1, what: 'w', fix: 'f' }],
  }), /atLeast|atMost/);
});

test('unlessPreviousLineMatches: a hit is excused by the line above; the first line has no line above', () => {
  const rule = patternRule({
    ...meta('fx-prev-line'),
    scanFiles: /\.cfg$/,
    matchLines: [{ match: /MUTE/, unlessPreviousLineMatches: /reason:/, what: 'bare {match}', fix: 'f' }],
  });
  const root = makeRepo({ changed: {
    'a.cfg': 'reason: flaky upstream\nMUTE\nMUTE\n',
    'b.cfg': 'MUTE\n',
  } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => [f.file, f.line]).sort(),
      [['a.cfg', 3], ['b.cfg', 1]]);
  } finally { cleanup(root); }
});

test('andLineMatches: both patterns must hit the same line for the assertion to flag it', () => {
  const rule = patternRule({
    ...meta('fx-and-line'),
    scanFiles: /\.txt$/,
    matchLines: [{ match: /.*\bskip\b.*/, andLineMatches: /\bwhen\b/, what: 'saw {match}', fix: 'f' }],
  });
  const root = makeRepo({ changed: { 'a.txt': 'skip always\nskip when idle\nwhen idle\n' } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => f.line), [2]);
    assert.equal(findings[0].what, 'saw skip when idle');
  } finally { cleanup(root); }
});

test('whenPathMatches: an assertion applies only in files whose path matches, so one rule scopes per file family', () => {
  const rule = patternRule({
    ...meta('fx-path-scoped'),
    scanFiles: /\.(txt|cfg)$/,
    matchLines: [
      { match: /tok/, whenPathMatches: /\.txt$/, what: 'text hit', fix: 'f' },
      { match: /tok/, whenPathMatches: /\.cfg$/, what: 'config hit', fix: 'f' },
    ],
  });
  const root = makeRepo({ changed: { 'a.txt': 'tok\n', 'b.cfg': 'tok\n' } });
  try {
    assert.deepEqual(rule.run(ctxOf(root)).map((f) => [f.file, f.what]).sort(),
      [['a.txt', 'text hit'], ['b.cfg', 'config hit']]);
  } finally { cleanup(root); }
});

test('maxLineLength: one finding per file at the first over-long line, measured in bytes', () => {
  const rule = patternRule({
    ...meta('fx-line-length'),
    scanFiles: /^docs\/.+\.md$/,
    maxLineLength: { bytes: 100, what: '{count} line(s) over {bytes} bytes, longest {longest}', fix: 'f' },
  });
  const root = makeRepo({ changed: {
    'docs/long.md': `short\n${'é'.repeat(60)}\n${'x'.repeat(150)}\n`,
    'docs/fine.md': `${'x'.repeat(100)}\n`,
  } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => [f.file, f.line]), [['docs/long.md', 2]]);
    assert.equal(findings[0].what, '2 line(s) over 100 bytes, longest 150');
  } finally { cleanup(root); }
});

test('someTrackedFileContains.ignoringComments: a marker only a comment carries does not arm the rule', () => {
  const ruleOf = (id) => patternRule({
    ...meta(id),
    relevantWhen: {
      someTrackedFileContains: { pathMatching: /\.swift$/, text: /\binstallTap\s*\(/, ignoringComments: true },
    },
    scanFiles: /\.plist$/,
    matchLines: [{ match: /Sudden/, what: 'w', fix: 'f' }],
  });
  const commentOnly = makeRepo({ changed: {
    'App.swift': '// we call installTap ( elsewhere\nlet x = 1\n',
    'Info.plist': 'Sudden\n',
  } });
  const inCode = makeRepo({ changed: {
    'App.swift': 'engine.inputNode.installTap (onBus: 0)\n',
    'Info.plist': 'Sudden\n',
  } });
  try {
    assert.equal(ruleOf('fx-gate-comment-blind-a').run(ctxOf(commentOnly)).length, 0);
    assert.equal(ruleOf('fx-gate-comment-blind-b').run(ctxOf(inCode)).length, 1);
  } finally { cleanup(commentOnly); cleanup(inCode); }
});

test('checkParsedFiles: requireValueInArray flags a missing value, and matches an entry object by its declared field', () => {
  const rule = patternRule({
    ...meta('fx-require-value'),
    checkParsedFiles: [{
      file: 'settings.json',
      requireValueInArray: { atField: 'packs', value: 'core', matchingEntryObjectsByField: 'id' },
      what: 'does not declare core', fix: 'add it',
    }],
  });
  const missing = makeRepo({ changed: { 'settings.json': '{"packs":["basics"]}' } });
  const asString = makeRepo({ changed: { 'settings.json': '{"packs":["basics","core"]}' } });
  const asObject = makeRepo({ changed: { 'settings.json': '{"packs":[{"id":"core","config":{}}]}' } });
  const noField = makeRepo({ changed: { 'settings.json': '{"rules":{}}' } });
  const absent = makeRepo({ changed: { 'other.json': '{}' } });
  try {
    const findings = rule.run(ctxOf(missing));
    assert.deepEqual(findings.map((f) => [f.file, f.what]), [['settings.json', 'does not declare core']]);
    assert.equal(rule.run(ctxOf(asString)).length, 0);
    assert.equal(rule.run(ctxOf(asObject)).length, 0);
    assert.equal(rule.run(ctxOf(noField)).length, 1);
    assert.equal(rule.run(ctxOf(absent)).length, 0);
  } finally { [missing, asString, asObject, noField, absent].forEach(cleanup); }
});

test('requireIndexCoverage: whoseTextMatches narrows the path quantifier by content, read comment-blind under scanIgnoringComments', () => {
  const rule = patternRule({
    ...meta('fx-coverage-content'),
    scanIgnoringComments: true,
    requireIndexCoverage: [{
      eachTrackedPathMatching: /^packs\/(?<pack>[^/]+)\/pack\.mjs$/,
      whoseTextMatches: /(^|[^\w.$])seededByDefault\s*:\s*true\b/,
      indexFile: 'settings.json',
      coveredByValueInArrayAtField: { atField: 'packs', value: '{pack}', matchingEntryObjectsByField: 'id' },
      whenIndexFileAbsent: 'assertNothing',
      anchorFindingsAt: 'indexFile',
      what: '"{pack}" is seeded but not declared', fix: 'declare {pack}',
    }],
  });
  const root = makeRepo({ changed: {
    'packs/seeded/pack.mjs': "export default { id: 'seeded', seededByDefault: true };\n",
    'packs/talked/pack.mjs': "// seededByDefault: true — prose only\nexport default { id: 'talked' };\n",
    'packs/declared/pack.mjs': "export default { id: 'declared', seededByDefault: true };\n",
    'packs/object/pack.mjs': "export default { id: 'object', seededByDefault: true };\n",
    'settings.json': '{"packs":["declared",{"id":"object"}]}',
  } });
  const noIndex = makeRepo({ changed: {
    'packs/seeded/pack.mjs': "export default { id: 'seeded', seededByDefault: true };\n",
  } });
  try {
    const findings = rule.run(ctxOf(root));
    assert.deepEqual(findings.map((f) => [f.file, f.what]),
      [['settings.json', '"seeded" is seeded but not declared']]);
    assert.equal(rule.run(ctxOf(noIndex)).length, 0);
  } finally { cleanup(root); cleanup(noIndex); }
});

// The value-set pair, exercised through the table-driven ruleTester: one
// extraction names the set, the coverage quantifier consumes it.
ruleTester(patternRule({
  ...meta('fx-value-sets'),
  extractValueSets: [{
    setName: 'requestedPermissions',
    fromParsedFilesMatching: /(^|\/)manifest\.json$/,
    whereFileContains: /"manifest_version"/,
    valuesOfArraysAtFields: ['permissions', 'host_permissions'],
    whenSetEmpty: 'assertNothing',
  }],
  requireIndexCoverage: [{
    eachValueOfSet: 'requestedPermissions',
    indexFile: 'PRIVACY.md',
    coveredByText: '{value}',
    whenIndexFileAbsent: 'assertNothing',
    anchorFindingsAt: 'indexFile',
    what: 'manifest requests "{value}" undisclosed', fix: 'disclose {value}',
  }],
}), {
  clean: {
    'every extracted value is covered in the index text': { files: {
      'app/manifest.json': '{"manifest_version":3,"permissions":["storage"],"host_permissions":["https://e.com/*"]}',
      'PRIVACY.md': 'We use storage, and connect to https://e.com/* for data.\n',
    } },
    'an absent index file asserts nothing, as declared': { files: {
      'app/manifest.json': '{"manifest_version":3,"permissions":["tabs"]}',
    } },
    'no matching source document means an empty set, declared to assert nothing': { files: {
      'decoy/manifest.json': '{"permissions":["cookies"]}',
      'PRIVACY.md': 'Nothing to disclose.\n',
    } },
  },
  flagged: {
    'values from every listed field are quantified; the decoy without the content probe is not': {
      files: {
        'app/manifest.json': '{"manifest_version":3,"permissions":["tabs","storage"],"host_permissions":["https://x.io/*"]}',
        'decoy/manifest.json': '{"permissions":["cookies"]}',
        'PRIVACY.md': 'We use storage to keep your notes.\n',
      },
      at: [
        { file: 'PRIVACY.md', what: /"https:\/\/x\.io\/\*" undisclosed/ },
        { file: 'PRIVACY.md', what: /"tabs" undisclosed/ },
      ],
    },
  },
});

test('extractValueSets: a consumer naming an undeclared set, and a malformed entry, are authoring errors', () => {
  assert.throws(() => patternRule({
    ...meta('fx-set-unknown'),
    requireIndexCoverage: [{
      eachValueOfSet: 'nobodyDeclaredMe', indexFile: 'x.md', coveredByText: '{value}',
      whenIndexFileAbsent: 'assertNothing', anchorFindingsAt: 'indexFile', what: 'w', fix: 'f',
    }],
  }), /names no declared value set/);
  assert.throws(() => patternRule({
    ...meta('fx-set-no-empty-mode'),
    extractValueSets: [{
      setName: 's', fromParsedFile: 'a.json', valuesOfArraysAtFields: ['p'],
    }],
  }), /whenSetEmpty/);
});

// The indented-block relations, in both directions. The fixture is the YAML
// shape they were built for: a `steps:` block whose members are indented under
// it, and a step key whose own value block sits below it.
ruleTester(patternRule({
  ...meta('fx-block-has'),
  scanFiles: /\.yml$/,
  matchLines: [
    { match: /uses: checkout/, unlessIndentedBlockBelowMatches: /submodules: true/,
      what: 'checkout without submodules', fix: 'add submodules: true' },
    { match: /^\s*(?:-\s+)?run: \|\s*$/, andIndentedBlockBelowMatches: /\|/,
      what: 'a pipe in the run block', fix: 'set shell: bash' },
  ],
}), {
  clean: {
    'the block below the matched line satisfies the negative relation': { files: { 'a.yml':
`jobs:
  t:
    steps:
      - uses: checkout
        with:
          submodules: true
` } },
    'the positive relation is unmet — the block below holds no match': { files: { 'a.yml':
`jobs:
  t:
    steps:
      - run: |
          make test
` } },
  },
  flagged: {
    'a dedent to the opener column closes the block, so a later sibling does not cover': { files: { 'a.yml':
`jobs:
  t:
    steps:
      - uses: checkout
      - uses: other
        with:
          submodules: true
` },
      at: [{ file: 'a.yml', line: 4, what: /without submodules/ }] },
    'the positive relation reaches through blank lines to the whole indented block': { files: { 'a.yml':
`jobs:
  t:
    steps:
      - run: |
          make build

          make test 2>&1 | tee log
      - uses: checkout
        with:
          submodules: true
` },
      at: [{ file: 'a.yml', line: 4, what: /a pipe in the run block/ }] },
  },
});

ruleTester(patternRule({
  ...meta('fx-block-inside'),
  scanFiles: /\.yml$/,
  matchLines: [
    { match: /secrets\.\w+/, andLineMatches: /^\s*if:\s/, unlessWithinBlockOpenedBy: /^\s*steps:\s*$/,
      what: 'job-level if: reads {match}', fix: 'gate with vars.*' },
  ],
}), {
  clean: {
    'a line inside the named block is exempt, however deeply nested': { files: { 'a.yml':
`jobs:
  deploy:
    steps:
      - run: echo hi
        if: \${{ secrets.TOKEN != '' }}
` } },
  },
  flagged: {
    'outside the block, and a sibling at the opener column is outside it': { files: { 'a.yml':
`jobs:
  deploy:
    if: \${{ secrets.DEPLOY_ARN != '' }}
    steps:
      - run: echo hi
        if: \${{ secrets.TOKEN != '' }}
  publish:
    steps:
      - run: echo bye
    if: \${{ secrets.PUBLISH_ARN != '' }}
` },
      at: [
        { file: 'a.yml', line: 3, what: /reads secrets\.DEPLOY_ARN/ },
        { file: 'a.yml', line: 10, what: /reads secrets\.PUBLISH_ARN/ },
      ] },
  },
});

ruleTester(patternRule({
  ...meta('fx-block-inside-positive'),
  scanFiles: /\.yml$/,
  matchLines: [
    { match: /- cron:/, andWithinBlockOpenedBy: /^\s*schedule:\s*$/,
      what: 'a cron entry inside schedule:', fix: 'n/a' },
  ],
}), {
  clean: {
    'a cron entry with no enclosing schedule: block': { files: { 'a.yml':
`on:
  workflow_dispatch:
    inputs:
      - cron: '0 * * * *'
` } },
    'a sibling block at the opener column does not enclose': { files: { 'a.yml':
`on:
  schedule:
    - foo: bar
  workflow_dispatch:
    - cron: '0 * * * *'
` } },
  },
  flagged: {
    'a cron entry nested directly under schedule:': { files: { 'a.yml':
`on:
  schedule:
    - cron: '0 3 * * *'
` },
      at: [{ file: 'a.yml', line: 3 }] },
    'the positive relation reaches through deeper nesting too': { files: { 'a.yml':
`on:
  schedule:
    entries:
      - cron: '0 3 * * *'
` },
      at: [{ file: 'a.yml', line: 4 }] },
  },
});
