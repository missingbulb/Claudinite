import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import barrier from './check.mjs';
import {
  normalizeEdges, resolveRef, candidatesOn, buildIndex, under, normPrefix, defineBarrier,
} from './engine.mjs';

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
  assert.match(missing[0].what, /"from" and "to"/);

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

// --- composition: defineBarrier for other packs -----------------------------

test('defineBarrier yields a rule another pack can own', () => {
  const rule = defineBarrier({
    id: 'requirements-isolation',
    edges: [{ from: 'requirements', to: '*', reason: 'requirements is a pure sink' }],
  });
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
