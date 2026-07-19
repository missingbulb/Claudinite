import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import barrier from './check.mjs';
import {
  normalizeEdges, resolveRef, candidatesOn, buildIndex, under, normPrefix,
} from './engine.mjs';
import { contributedBarrierRules } from './contributed.mjs';

// Run the config-driven check with the given packConfig.barriers and repo files.
function runCheck(barriersConfig, files) {
  const root = makeRepo({ changed: files });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    ctx.config = { ...ctx.config, packConfig: { barriers: barriersConfig } };
    return barrier.run(ctx);
  } finally { cleanup(root); }
}

// --- import / relative-path detection ---------------------------------------

test('flags an ES import that resolves into the barred folder', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/popup.js': "import { db } from '../server/db.js';\n",
    'server/db.js': 'export const db = 1;\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'extension/popup.js');
  assert.equal(f[0].line, 1);
  assert.match(f[0].what, /server\/db\.js/);
});

test('resolves extension-less specifiers and directory imports', () => {
  const noExt = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.ts': "import x from '../server/db';\n",
    'server/db.ts': 'export default 1;\n',
  });
  assert.equal(noExt.length, 1);
  const dir = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.ts': "import x from '../server';\n",
    'server/index.ts': 'export default 1;\n',
  });
  assert.equal(dir.length, 1);
});

test('resolves a backslash relative path', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': '// see ..\\server\\db.js for the schema\n',
    'server/db.js': 'export const db = 1;\n',
  });
  assert.equal(f.length, 1);
});

test('flags a repo-root-relative path string', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': "const p = 'server/secrets.js';\n",
    'server/secrets.js': 'export const s = 1;\n',
  });
  assert.equal(f.length, 1);
});

// --- comments and Markdown --------------------------------------------------

test('flags a path mentioned in a comment', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.py': '# the token lives in server/auth/token.py\n',
    'server/auth/token.py': 'TOKEN = 1\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 1);
});

test('flags a path referenced in a Markdown doc under the guarded folder', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/README.md': 'The handler is defined in [here](../server/handler.js).\n',
    'server/handler.js': 'export default 1;\n',
  });
  assert.equal(f.length, 1);
});

// --- unique filename-with-extension layer -----------------------------------

test('flags a bare unique filename-with-extension mention', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': '// duplicate the shape from tokenStore.ts\n',
    'server/tokenStore.ts': 'export const t = 1;\n',
  });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /tokenStore\.ts/);
});

test('does NOT flag a bare filename that is not unique in the repo', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': '// like utils.js elsewhere\n',
    'extension/utils.js': 'export const e = 1;\n',
    'server/utils.js': 'export const s = 1;\n',
  });
  assert.equal(f.length, 0);
});

test('does NOT flag a bare name without an extension', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': '// talk to the server module about auth\n',
    'server/auth.js': 'export const a = 1;\n',
  });
  assert.equal(f.length, 0);
});

// --- precision: the tree is the oracle --------------------------------------

test('does NOT flag an English mention that resolves to nothing', () => {
  const f = runCheck({ rules: [{ from: 'client', to: 'server' }] }, {
    'client/a.js': '// this talks to the server over HTTP; the API server is remote\n',
    'server/real.js': 'export const r = 1;\n',
  });
  assert.equal(f.length, 0);
});

test('does NOT flag a URL containing the folder name', () => {
  const f = runCheck({ rules: [{ from: 'client', to: 'server' }] }, {
    'client/a.js': "fetch('https://server/api/v1');\n",
    'server/api.js': 'export const a = 1;\n',
  });
  assert.equal(f.length, 0);
});

test('does NOT flag a reference within the guarded folder itself', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': "import b from './b.js';\nimport c from '../extension/c.js';\n",
    'extension/b.js': 'export default 1;\n',
    'extension/c.js': 'export default 1;\n',
    'server/x.js': 'export default 1;\n',
  });
  assert.equal(f.length, 0);
});

// --- mutual bans and allow carve-outs ---------------------------------------

test('between: bars both directions', () => {
  const f = runCheck({ rules: [{ between: ['server', 'extension'] }] }, {
    'server/a.js': "import x from '../extension/e.js';\n",
    'extension/e.js': "import y from '../server/a.js';\n",
  });
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.file).sort(), ['extension/e.js', 'server/a.js']);
});

test('allow carve-out lets both sides reach a shared folder', () => {
  const f = runCheck({ rules: [{ between: ['client', 'server'], allow: ['shared'] }] }, {
    'client/a.js': "import { T } from '../shared/types.js';\nimport { S } from '../server/s.js';\n",
    'server/s.js': "import { T } from '../shared/types.js';\n",
    'shared/types.js': 'export const T = 1;\n',
  });
  // client→server is the only crossing; both →shared are allowed.
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'client/a.js');
  assert.match(f[0].what, /server\/s\.js/);
});

// --- isolation (sink), to: '*' ----------------------------------------------

test("to '*': the guarded folder may reference nothing outside itself or allow", () => {
  const f = runCheck({ rules: [{ from: 'requirements', to: '*', allow: ['README.md'] }] }, {
    'requirements/spec.md': 'See ../src/app.js and the root README.md.\n',
    'src/app.js': 'export default 1;\n',
    'README.md': 'root\n',
  });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /src\/app\.js/);
});

test("to '*': other folders may still reference the sink", () => {
  const f = runCheck({ rules: [{ from: 'requirements', to: '*' }] }, {
    'requirements/spec.md': 'pure\n',
    'src/app.js': '// implements ../requirements/spec.md\n',
    'requirements/x.md': 'x\n',
  });
  assert.equal(f.length, 0);
});

// --- config validation ------------------------------------------------------

test('unconfigured barriers is a no-op', () => {
  assert.deepEqual(runCheck(undefined, { 'a/x.js': '1\n' }), []);
  const root = makeRepo({ changed: { 'a/x.js': '1\n' } });
  try {
    const ctx = buildContext({ root, mode: 'all' }); // no packConfig at all
    assert.deepEqual(barrier.run(ctx), []);
  } finally { cleanup(root); }
});

test('malformed config surfaces a blocking config finding', () => {
  const notObj = runCheck({ rules: 'nope' }, { 'a/x.js': '1\n' });
  assert.equal(notObj.length, 1);
  assert.equal(notObj[0].file, '.claudinite-checks.json');
  assert.equal(notObj[0].severity, 'blocking');

  const missing = runCheck({ rules: [{ from: 'a' }] }, { 'a/x.js': '1\n' });
  assert.equal(missing.length, 1);
  assert.match(missing[0].what, /needs a "to"/);

  const overlap = runCheck({ rules: [{ from: 'a', to: 'a/b' }] }, { 'a/b/x.js': '1\n' });
  assert.equal(overlap.length, 1);
  assert.match(overlap[0].what, /overlap/);
});

test('a reasoned acceptance clears a real crossing (integration through the runner)', () => {
  // The engine emits the finding; findings.js applyConfig honors the acceptance —
  // this asserts the finding is shaped so an accept entry can retire it.
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': "import x from '../server/db.js';\n",
    'server/db.js': 'export default 1;\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'barrier');
  assert.equal(f[0].file, 'extension/a.js');
});

// --- composition: barriers contributed by other packs' manifests ------------

test('a contributed barrier becomes a first-class rule under its own id', () => {
  const [rule] = contributedBarrierRules([{
    id: 'somepack',
    contributes: {
      barriers: [{
        id: 'requirements-isolation',
        edges: [{ from: 'requirements', to: '*', reason: 'requirements is a pure sink' }],
      }],
    },
  }]);
  assert.equal(rule.id, 'requirements-isolation');
  const root = makeRepo({ changed: {
    'requirements/spec.md': 'see ../src/a.js\n',
    'src/a.js': 'export default 1;\n',
  } });
  try {
    const out = rule.run(buildContext({ root, mode: 'all' }));
    assert.equal(out.length, 1);
    assert.equal(out[0].rule, 'requirements-isolation');
    assert.equal(out[0].why, 'requirements is a pure sink');
  } finally { cleanup(root); }
});

test('gateDir keeps a contributed barrier inert until the gate directory exists', () => {
  const [rule] = contributedBarrierRules([{
    id: 'p',
    contributes: {
      barriers: [{
        id: 'gated-isolation',
        gateDir: 'the-gate',
        edges: [{ from: 'requirements', to: '*', reason: 'sink' }],
      }],
    },
  }]);
  const files = { 'requirements/spec.md': 'see ../src/a.js\n', 'src/a.js': 'export default 1;\n' };
  const closed = makeRepo({ changed: files });
  const open = makeRepo({ changed: { ...files, 'the-gate/marker.txt': 'x\n' } });
  try {
    assert.deepEqual(rule.run(buildContext({ root: closed, mode: 'all' })), []);
    assert.equal(rule.run(buildContext({ root: open, mode: 'all' })).length, 1);
  } finally { cleanup(closed); cleanup(open); }
});

test('packs without contributions add nothing; a malformed contribution is a blocking finding at the manifest', () => {
  assert.deepEqual(contributedBarrierRules([{ id: 'plain' }, { id: 'other', contributes: {} }]), []);
  const rules = contributedBarrierRules([
    { id: 'bad-shape', contributes: { barriers: { id: 'not-an-array' } } },
    { id: 'no-id', local: true, contributes: { barriers: [{ edges: [] }] } },
  ]);
  assert.equal(rules.length, 2);
  const findings = rules.flatMap((r) => r.run());
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.severity === 'blocking'));
  assert.equal(findings[0].file, 'packs/bad-shape/pack.mjs');
  assert.match(findings[0].what, /not an array/);
  assert.match(findings[1].file, /local_packs\/no-id\/pack\.mjs$/);
  assert.match(findings[1].what, /no string "id"/);
});

// --- unit tests for the engine primitives -----------------------------------

test('normPrefix folds separators and strips ./ and trailing /', () => {
  assert.equal(normPrefix('./server/'), 'server');
  assert.equal(normPrefix('a\\b\\'), 'a/b');
  assert.equal(normPrefix('*'), '*');
});

test('under: prefix containment', () => {
  assert.equal(under('server/db.js', 'server'), true);
  assert.equal(under('server', 'server'), true);
  assert.equal(under('servers/db.js', 'server'), false); // sibling-name guard
  assert.equal(under('anything', ''), true);
  assert.equal(under('anything', '*'), false);
});

test('candidatesOn: extracts quoted and path-ish tokens, drops URLs and punctuation', () => {
  assert.deepEqual(candidatesOn("import x from '../server/db.js';").sort(), ['../server/db.js']);
  assert.deepEqual(candidatesOn('see (../server/db.js).').sort(), ['../server/db.js']);
  assert.equal(candidatesOn("fetch('https://x/y')").includes('https://x/y'), false);
  assert.equal(candidatesOn('a bare word here').length, 0);
  assert.ok(candidatesOn('mentions tokenStore.ts inline').includes('tokenStore.ts'));
});

test('resolveRef: relative escape returns null, dotted module resolves', () => {
  const index = buildIndex({ tracked: ['server/pkg/mod.py', 'extension/a.py'] });
  assert.equal(resolveRef('../server/pkg/mod.py', 'extension', index), 'server/pkg/mod.py');
  assert.equal(resolveRef('server.pkg.mod', 'extension', index), 'server/pkg/mod.py');
  assert.equal(resolveRef('../../../etc/passwd', 'extension', index), null);
  assert.equal(resolveRef('nonexistent/path.js', 'extension', index), null);
});

// --- regressions for the adversarial-review fixes ---------------------------

test('does NOT misread a JS member call as a dotted module path (db.query → db/query.js)', () => {
  const f = runCheck({ rules: [{ from: 'client', to: 'db' }] }, {
    'client/orders.js': 'export function load(db) {\n  return db.query(1);\n}\n',
    'db/query.js': 'export const q = 1;\n',
    'db/connect.js': 'export const c = 1;\n',
  });
  assert.equal(f.length, 0);
  // The dotted layer stays Python-only, so a real Python module still resolves.
  const py = buildIndex({ tracked: ['db/query.py', 'client/a.py'] });
  assert.equal(resolveRef('db.query', 'client', py), 'db/query.py');
});

test('prefers the file-relative resolution over repo-root (no false crossing)', () => {
  const f = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': "const p = 'server/db.js';\n", // means extension/server/db.js, not root server/
    'extension/server/db.js': 'export const d = 1;\n',
    'server/db.js': 'export const d = 1;\n',
  });
  assert.equal(f.length, 0);
});

test('normPrefix strips a leading slash so an absolute-style from/to still enforces', () => {
  assert.equal(normPrefix('/src'), 'src');
  assert.equal(normPrefix('.'), '');
  assert.equal(normPrefix('/'), '');
  const f = runCheck({ rules: [{ from: '/extension', to: '/server' }] }, {
    'extension/a.js': "import x from '../server/db.js';\n",
    'server/db.js': 'export default 1;\n',
  });
  assert.equal(f.length, 1);
});

test('rejects an edge whose folder collapses to the repo root', () => {
  for (const bad of [{ from: '.', to: 'server' }, { from: 'extension', to: '/' }, { from: '/', to: '*' }]) {
    const f = runCheck({ rules: [bad] }, { 'extension/a.js': '1\n', 'server/b.js': '1\n' });
    assert.equal(f.length, 1, JSON.stringify(bad));
    assert.equal(f[0].file, '.claudinite-checks.json');
  }
});

test('between runs overlap validation (does not bypass it)', () => {
  const f = runCheck({ rules: [{ between: ['a', 'a/b'] }] }, { 'a/b/x.js': '1\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /overlap/);
});

test('allow accepts a string shorthand and rejects a non-string/array', () => {
  const ok = runCheck({ rules: [{ between: ['client', 'server'], allow: 'shared' }] }, {
    'client/a.js': "import { T } from '../shared/t.js';\n",
    'server/s.js': 'export default 1;\n',
    'shared/t.js': 'export const T = 1;\n',
  });
  assert.equal(ok.length, 0); // the only cross is client→shared, which allow permits
  const bad = runCheck({ rules: [{ from: 'client', to: 'server', allow: 7 }] }, { 'client/a.js': '1\n', 'server/s.js': '1\n' });
  assert.equal(bad.length, 1);
  assert.match(bad[0].what, /"allow" must be/);
});

test('an allow entry that would disable the barrier is a config error', () => {
  const f = runCheck({ rules: [{ from: 'client', to: 'server', allow: [''] }] }, { 'client/a.js': '1\n', 'server/s.js': '1\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /every "allow" entry/);
});

// --- repo-root from + except carve-outs ---------------------------------------

test('from "." with except: guards everything outside the carve-outs', () => {
  const f = runCheck({ rules: [{ from: '.', except: ['content/*'], to: 'content/*' }] }, {
    'core/a.js': "import x from '../content/alpha/mod.js';\n",
    'content/alpha/mod.js': 'export default 1;\n',
    'content/beta/other.js': "import y from '../alpha/mod.js';\n", // content may reference content
    'README.md': 'a root file referencing [alpha](content/alpha/mod.js)\n',
  });
  assert.deepEqual(f.map((x) => x.file).sort(), ['README.md', 'core/a.js']);
});

test('except carve-outs subtract files from the guarded set (folder, file, and *.suffix pattern)', () => {
  const f = runCheck({
    rules: [{
      from: '.',
      except: ['content/*', 'vendor', 'CATALOG.md', '*.stories.js'],
      to: 'content/*',
    }],
  }, {
    'vendor/a.js': "import x from '../content/alpha/mod.js';\n",
    'CATALOG.md': 'the catalog lists content/alpha/mod.js by design\n',
    'core/x.stories.js': "import x from '../content/alpha/mod.js';\n",
    'core/x.mjs': "import x from '../content/alpha/mod.js';\n",
    'content/alpha/mod.js': 'export default 1;\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'core/x.mjs');
});

test('a "<dir>/*" glob bars only child directories, not files directly under the dir', () => {
  const f = runCheck({ rules: [{ from: '.', except: ['content/*'], to: 'content/*' }] }, {
    'core/a.md': 'shared machinery: content/registry.mjs is fine, content/alpha/mod.js is not\n',
    'content/registry.mjs': 'export const r = 1;\n',
    'content/alpha/mod.js': 'export default 1;\n',
  });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /content\/alpha\/mod\.js/);
});

test('a repo-root "from" whose targets are not excepted is a config error', () => {
  const f = runCheck({ rules: [{ from: '.', to: 'server' }] }, {
    'core/a.js': '1\n',
    'server/s.js': '1\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, '.claudinite-checks.json');
  assert.match(f[0].what, /overlaps the repo-root guard/);
});

test('the repo root must be spelled "." — "" and "/" stay rejected', () => {
  for (const bad of ['', '/']) {
    const f = runCheck({ rules: [{ from: bad, to: 'server', except: ['server'] }] }, {
      'core/a.js': '1\n',
      'server/s.js': '1\n',
    });
    assert.equal(f.length, 1, JSON.stringify(bad));
    assert.equal(f[0].file, '.claudinite-checks.json');
  }
});

test('to accepts an array of targets', () => {
  const f = runCheck({ rules: [{ from: 'core', to: ['alpha', 'beta'] }] }, {
    'core/a.js': "import a from '../alpha/a.js';\nimport b from '../beta/b.js';\n",
    'alpha/a.js': '1\n',
    'beta/b.js': '1\n',
  });
  assert.equal(f.length, 2);
});

test('a "to" glob that expands to nothing is a blocking config finding (fail closed)', () => {
  const f = runCheck({ rules: [{ from: 'core', to: 'gone/*' }] }, {
    'core/a.js': '1\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, '.claudinite-checks.json');
  assert.match(f[0].what, /matched no directories/);
});

test('an unknown property on a rule or on packConfig.barriers is a config error', () => {
  const rule = runCheck({ rules: [{ from: 'a', to: 'b', alow: ['c'] }] }, { 'a/x.js': '1\n', 'b/y.js': '1\n' });
  assert.equal(rule.length, 1);
  assert.match(rule[0].what, /unknown property "alow"/);
  const top = runCheck({ rules: [], acept: [] }, { 'a/x.js': '1\n' });
  assert.equal(top.length, 1);
  assert.match(top[0].what, /unknown property "acept"/);
});

// --- the bare-name layer (matchNames / alsoMatchNames) ------------------------

test('matchNames: a distinctive barred-folder name is matched bare, in prose and strings', () => {
  const f = runCheck({ rules: [{ from: '.', except: ['content/*'], to: 'content/*', matchNames: true }] }, {
    'core/doc.md': 'the tidy-repo pack is seeded by default\n',
    'core/seed.mjs': "const seeded = ['tidy-repo'];\n",
    'content/tidy-repo/RULES.md': 'rules\n',
  });
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.file).sort(), ['core/doc.md', 'core/seed.mjs']);
  assert.match(f[0].what, /the name of the barred folder "content\/tidy-repo"/);
});

test('matchNames: a non-distinctive name only matches via alsoMatchNames; inside longer words it never fires', () => {
  const config = (alsoMatchNames) => ({
    rules: [{ from: '.', except: ['content/*'], to: 'content/*', matchNames: true, ...(alsoMatchNames && { alsoMatchNames }) }],
  });
  const files = {
    'core/doc.md': 'the basics pack; see also tidy-repo-seed.mjs and https://x/tidy-repo\n',
    'content/basics/RULES.md': 'rules\n',
    'content/tidy-repo/RULES.md': 'rules\n',
  };
  // "basics" is an ordinary word → silent; "tidy-repo" inside a longer hyphenated
  // token or a URL path never fires.
  assert.equal(runCheck(config(null), files).length, 0);
  const withAlso = runCheck(config(['basics']), files);
  assert.equal(withAlso.length, 1);
  assert.match(withAlso[0].what, /"basics"/);
});

test('matchNames config errors: alsoMatchNames typo, alsoMatchNames without matchNames, matchNames with "*"', () => {
  const typo = runCheck({ rules: [{ from: '.', except: ['content/*'], to: 'content/*', matchNames: true, alsoMatchNames: ['nope'] }] }, {
    'content/alpha/mod.js': '1\n',
  });
  assert.equal(typo.length, 1);
  assert.match(typo[0].what, /"nope" is not the name of any barred folder/);

  const noMatch = runCheck({ rules: [{ from: 'a', to: 'b', alsoMatchNames: ['b'] }] }, { 'a/x.js': '1\n', 'b/y.js': '1\n' });
  assert.equal(noMatch.length, 1);
  assert.match(noMatch[0].what, /"alsoMatchNames" requires "matchNames"/);

  const star = runCheck({ rules: [{ from: 'a', to: '*', matchNames: true }] }, { 'a/x.js': '1\n' });
  assert.equal(star.length, 1);
  assert.match(star[0].what, /"matchNames" needs named "to" folders/);
});

// --- explicit `from` allowlist (arrays; engine files inside content trees) ----

test('from accepts an array of core folders; folders not listed are out of scope', () => {
  const f = runCheck({ rules: [{ from: ['checks', 'growth'], to: 'content/*' }] }, {
    'checks/run.mjs': "import x from '../content/alpha/mod.js';\n",
    'growth/x.md': 'see content/beta/mod.js\n',
    'other/z.js': "import x from '../content/alpha/mod.js';\n", // not in from → not scanned
    'content/alpha/mod.js': '1\n',
    'content/beta/mod.js': '1\n',
  });
  assert.deepEqual(f.map((x) => x.file).sort(), ['checks/run.mjs', 'growth/x.md']);
});

test('a "from" file inside the barred glob-parent is guarded without a false overlap', () => {
  // The engine-file-among-content pattern (packs/registry.mjs guarded, to packs/*).
  const f = runCheck({ rules: [{ from: ['core', 'content/registry.mjs'], to: 'content/*' }] }, {
    'core/a.js': "import x from '../content/alpha/mod.js';\n",
    'content/registry.mjs': '// the schema lives in content/alpha/mod.js\n',
    'content/README.md': 'catalog: content/alpha lives here\n', // a sibling file, not a from entry → not scanned
    'content/alpha/mod.js': '1\n',
  });
  assert.deepEqual(f.map((x) => x.file).sort(), ['content/registry.mjs', 'core/a.js']);
});

test('the engine never scans *.test.mjs (a test references what it tests)', () => {
  const f = runCheck({ rules: [{ from: 'core', to: 'content/*' }] }, {
    'core/thing.test.mjs': "import x from '../content/alpha/mod.js';\n",
    'core/thing.mjs': "import x from '../content/alpha/mod.js';\n",
    'content/alpha/mod.js': '1\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'core/thing.mjs');
});

// --- per-rule reviewed exceptions ({ path, to?, reason }) and their staleness --

test('a reviewed exception excuses one file × target; other crossings in the file still fail', () => {
  const f = runCheck({
    rules: [{
      from: 'core', to: 'content/*',
      except: [{ path: 'core/a.md', to: ['content/alpha'], reason: 'reviewed: alpha cited as an example' }],
    }],
  }, {
    'core/a.md': 'see content/alpha/mod.js and content/beta/mod.js\n',
    'content/alpha/mod.js': '1\n',
    'content/beta/mod.js': '1\n',
  });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /content\/beta\/mod\.js/);
});

test('a reviewed exception with a trailing "/" excuses a subtree', () => {
  const f = runCheck({
    rules: [{
      from: 'docs', to: 'content/*',
      except: [{ path: 'docs/', to: 'content/alpha', reason: 'the docs tree cites alpha deliberately' }],
    }],
  }, {
    'docs/deep/a.md': 'see content/alpha/mod.js\n',
    'content/alpha/mod.js': '1\n',
  });
  assert.equal(f.length, 0);
});

test('a to-less exception excuses the whole file; unused it goes stale on a whole-repo sweep', () => {
  const excused = runCheck({
    rules: [{ from: 'core', to: 'content/*', except: [{ path: 'core/ledger.md', reason: 'historical ledger' }] }],
  }, {
    'core/ledger.md': 'see content/alpha/mod.js and content/beta/mod.js\n',
    'content/alpha/mod.js': '1\n',
    'content/beta/mod.js': '1\n',
  });
  assert.equal(excused.length, 0);

  const stale = runCheck({
    rules: [{ from: 'core', to: 'content/*', except: [{ path: 'core/ledger.md', reason: 'historical ledger' }] }],
  }, {
    'core/ledger.md': 'no crossings now\n',
    'content/alpha/mod.js': '1\n',
  });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].severity, 'blocking');
  assert.match(stale[0].what, /matched nothing/);
});

test('a pinned exception whose target is unused is a blocking stale finding', () => {
  const f = runCheck({
    rules: [{
      from: 'core', to: 'content/*',
      except: [{ path: 'core/a.md', to: ['content/alpha', 'content/beta'], reason: 'reviewed' }],
    }],
  }, {
    'core/a.md': 'see content/alpha/mod.js\n',
    'content/alpha/mod.js': '1\n',
    'content/beta/mod.js': '1\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'blocking');
  assert.match(f[0].what, /"content\/beta" matched nothing/);
});

test("a rule's except mixes carve-out strings and reviewed exceptions", () => {
  const f = runCheck({
    rules: [{
      from: '.', to: 'content/*',
      except: ['content/*', { path: 'core/a.md', to: ['content/alpha'], reason: 'reviewed' }],
    }],
  }, {
    'core/a.md': 'see content/alpha/mod.js\n',
    'core/b.md': 'see content/beta/mod.js\n',
    'content/alpha/mod.js': '1\n',
    'content/beta/mod.js': '1\n',
  });
  // content/* keeps content unscanned & barrable; a.md→alpha is excused; b.md→beta fires.
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'core/b.md');
});

test('malformed reviewed exceptions are config errors (no reason, unknown key, bad to, no path)', () => {
  const cases = [
    [{ path: 'core/a.md', to: 'content/alpha' }, /has no reason/],
    [{ path: 'core/a.md', to: 'content/alpha', reason: 'r', until: '2027' }, /unknown property "until"/],
    [{ path: 'core/a.md', to: 'content/*', reason: 'r' }, /malformed "to"/],
    [{ to: 'content/alpha', reason: 'r' }, /needs a string "path"/],
  ];
  for (const [entry, re] of cases) {
    const f = runCheck({ rules: [{ from: 'core', to: 'content/*', except: [entry] }] },
      { 'core/x.js': '1\n', 'content/alpha/mod.js': '1\n' });
    assert.equal(f.length, 1, JSON.stringify(entry));
    assert.match(f[0].what, re);
    assert.equal(f[0].file, '.claudinite-checks.json');
  }
});

test('matchUniqueFilenames: false opts out of the bare-filename layer (convention markers)', () => {
  // "config.yml" is carried by exactly one folder, so the unique-basename layer
  // resolves a bare mention to it — a false coupling when the filename is really a
  // convention many folders are meant to carry. The flag turns that layer off.
  const on = runCheck({ rules: [{ from: 'core', to: 'content/*' }] }, {
    'core/a.js': '// every plugin ships a config.yml\n',
    'content/alpha/config.yml': 'x: 1\n',
  });
  assert.equal(on.length, 1);
  const off = runCheck({ rules: [{ from: 'core', to: 'content/*', matchUniqueFilenames: false }] }, {
    'core/a.js': '// every plugin ships a config.yml\n',
    'content/alpha/config.yml': 'x: 1\n',
  });
  assert.equal(off.length, 0);
  // path references and distinctive names still fire with the layer off.
  const stillCaught = runCheck({
    rules: [{ from: 'core', to: 'content/*', matchNames: true, matchUniqueFilenames: false }],
  }, {
    'core/a.js': "import x from '../content/alpha/config.yml';\n// see the my-plugin folder\n",
    'content/alpha/config.yml': 'x: 1\n',
    'content/my-plugin/RULES.md': 'r\n',
  });
  assert.equal(stillCaught.length, 2);
  const bad = runCheck({ rules: [{ from: 'core', to: 'content/*', matchUniqueFilenames: 'no' }] }, { 'core/a.js': '1\n', 'content/alpha/m.js': '1\n' });
  assert.equal(bad.length, 1);
  assert.match(bad[0].what, /"matchUniqueFilenames" must be true or false/);
});

test('resolves a Sass underscore partial and a long-extension bare filename', () => {
  const scss = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.scss': "@use '../server/theme';\n",
    'server/_theme.scss': '$c: red;\n',
  });
  assert.equal(scss.length, 1);
  const long = runCheck({ rules: [{ from: 'extension', to: 'server' }] }, {
    'extension/a.js': '// mirrors server settings in config.properties\n',
    'server/config.properties': 'a=1\n',
  });
  assert.equal(long.length, 1);
});

// --- siblings + scope: 'imports' --------------------------------------------

test('siblings: each direct child of the folder is guarded against the rest; own files stay open', () => {
  const files = {
    'content/a/mod.mjs': "import x from '../b/util.mjs';\nimport y from './own.mjs';\n",
    'content/a/own.mjs': 'export default 1;\n',
    'content/b/util.mjs': 'export default 1;\n',
    'content/b/clean.mjs': "import z from './util.mjs';\n",
  };
  const f = runCheck({ rules: [{ siblings: 'content', to: 'content/*' }] }, files);
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'content/a/mod.mjs');
  assert.match(f[0].what, /content\/b/);
});

test('siblings with "*" isolation and allow: allowed reaches pass, everything else outside fires', () => {
  const files = {
    'content/a/mod.mjs': "import { f } from '../../engine/lib/f.mjs';\nimport m from '../../internal/reg.mjs';\n",
    'engine/lib/f.mjs': 'export const f = 1;\n',
    'internal/reg.mjs': 'export default 1;\n',
  };
  const f = runCheck({ rules: [{ siblings: 'content', to: '*', allow: ['engine'] }] }, files);
  assert.equal(f.length, 1);
  assert.match(f[0].what, /internal\/reg\.mjs/);
});

test('siblings: a folder with no tracked child directories fails closed', () => {
  const f = runCheck({ rules: [{ siblings: 'nope', to: '*' }] }, { 'a.md': 'x\n' });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /no tracked child directories/);
});

test("scope 'imports': an import specifier fires; a doc link or comment path does not", () => {
  const files = {
    'content/a/mod.mjs': "import x from '../b/util.mjs';\n",
    'content/a/README.md': 'See [the helper](../b/util.mjs) for details.\n',
    'content/a/notes.mjs': '// background: ../b/util.mjs holds the helper\n',
    'content/b/util.mjs': 'export default 1;\n',
  };
  const f = runCheck({ rules: [{ siblings: 'content', to: 'content/*', scope: 'imports' }] }, files);
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 'content/a/mod.mjs');
  assert.equal(f[0].line, 1);
});

test("scope 'imports' also catches require() and dynamic import()", () => {
  const files = {
    'content/a/x.js': "const u = require('../b/util.js');\n",
    'content/a/y.mjs': "const m = await import('../b/util.js');\n",
    'content/b/util.js': 'module.exports = 1;\n',
  };
  const f = runCheck({ rules: [{ siblings: 'content', to: 'content/*', scope: 'imports' }] }, files);
  assert.equal(f.length, 2);
});

test('siblings/scope validation: bad shapes and forbidden combinations are config errors', () => {
  const badSiblings = runCheck({ rules: [{ siblings: 42, to: '*' }] }, { 'a.md': 'x\n' });
  assert.equal(badSiblings.length, 1);
  assert.match(badSiblings[0].what, /"siblings"/);
  const withFrom = runCheck({ rules: [{ siblings: 'content', from: 'core', to: '*' }] }, { 'a.md': 'x\n' });
  assert.equal(withFrom.length, 1);
  assert.match(withFrom[0].what, /"siblings".*"from"|"from".*"siblings"/);
  const badScope = runCheck({ rules: [{ from: 'a', to: 'b', scope: 'everything' }] }, { 'a/x.js': '1\n', 'b/y.js': '1\n' });
  assert.equal(badScope.length, 1);
  assert.match(badScope[0].what, /"scope"/);
  const namesWithImports = runCheck({ rules: [{ from: 'a', to: 'b', scope: 'imports', matchNames: true }] }, { 'a/x.js': '1\n', 'b/y.js': '1\n' });
  assert.equal(namesWithImports.length, 1);
  assert.match(namesWithImports[0].what, /matchNames.*imports|imports.*matchNames/);
});

// --- scope 'imports': faithfulness to real module edges ----------------------

test('the index sees in-scope untracked files: untracked import targets and untracked sibling dirs are guarded', () => {
  const root = makeRepo({
    changed: { 'content/b/util.mjs': 'export default 1;\n' },
    uncommitted: {
      'content/a/mod.mjs': "import x from '../b/newthing.mjs';\n",
      'content/b/newthing.mjs': 'export default 1;\n',
      'content/c/rogue.mjs': "import y from '../b/util.mjs';\n",
    },
  });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    ctx.config = { ...ctx.config, packConfig: { barriers: { rules: [{ siblings: 'content', to: 'content/*', scope: 'imports' }] } } };
    const f = barrier.run(ctx);
    const files = f.map((x) => x.file).sort();
    assert.deepEqual(files, ['content/a/mod.mjs', 'content/c/rogue.mjs'], JSON.stringify(f, null, 1));
  } finally { cleanup(root); }
});

test("scope 'imports' matches only relative specifiers: root-relative paths and bare filenames in comments never fire", () => {
  const f = runCheck({ rules: [{ siblings: 'content', to: 'content/*', scope: 'imports' }] }, {
    'content/a/mod.mjs': '// data taken from "content/b/util.mjs" originally\n// never import \'util.mjs\' directly from a pack\n',
    'content/b/util.mjs': 'export default 1;\n',
  });
  assert.deepEqual(f, []);
});

test("scope 'imports' catches an import whose specifier sits on the next line", () => {
  const f = runCheck({ rules: [{ siblings: 'content', to: 'content/*', scope: 'imports' }] }, {
    'content/a/mod.mjs': "import x from\n  '../b/util.mjs';\n",
    'content/b/util.mjs': 'export default 1;\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 2);
});

test("scope 'imports': a directory import resolves through its index file; an index-less one is breakage, not a crossing", () => {
  const withIndex = runCheck({ rules: [{ siblings: 'content', to: 'content/*', scope: 'imports' }] }, {
    'content/a/mod.mjs': "import x from '../b';\n",
    'content/b/index.mjs': 'export default 1;\n',
  });
  assert.equal(withIndex.length, 1);
  const dangling = runCheck({ rules: [{ siblings: 'content', to: 'content/*', scope: 'imports' }] }, {
    'content/a/mod.mjs': "import x from '../b/docs';\n",
    'content/b/docs/README.md': 'no module here\n',
  });
  assert.deepEqual(dangling, []);
});
