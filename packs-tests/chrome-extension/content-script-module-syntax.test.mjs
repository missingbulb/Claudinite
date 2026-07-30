import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import moduleSyntax from '../../packs/chrome-extension/content-script-module-syntax.mjs';

const run = (root) => moduleSyntax.run(buildContext({ root, mode: 'all' }));

const MANIFEST = JSON.stringify({
  manifest_version: 3,
  name: 'fixture',
  version: '1.0',
  content_scripts: [{ matches: ['https://example.com/*'], js: ['content/main.js'] }],
}, null, 2);

const ext = (files) => makeRepo({ changed: { 'manifest.json': MANIFEST, ...files } });

test('content-script-module-syntax: flags a top-level import in a static content script', () => {
  const root = ext({
    'content/main.js': `import { greet } from './lib.js';\n\ngreet(document.title);\n`,
    'content/lib.js': "export const greet = (t) => console.log(t);\n",
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'content-script-module-syntax');
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'content/main.js');
    assert.equal(findings[0].line, 1);
    assert.match(findings[0].what, /top-level `import`/);
    assert.match(findings[0].fix, /dynamic import|import\(chrome\.runtime\.getURL/);
    // lib.js is only *imported* by the content script, never injected as one —
    // module syntax there is correct and must stay quiet.
    assert.equal(findings.filter((f) => f.file === 'content/lib.js').length, 0);
  } finally { cleanup(root); }
});

test('content-script-module-syntax: flags a top-level export too', () => {
  const root = ext({ 'content/main.js': "const x = 1;\nexport default x;\n" });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /top-level `export`/);
  } finally { cleanup(root); }
});

test('content-script-module-syntax: flags a script registered via registerContentScripts', () => {
  const root = ext({
    'manifest.json': JSON.stringify({ manifest_version: 3, name: 'f', version: '1.0' }),
    'content/main.js': 'console.log("classic");\n',
    'sw.js': `chrome.scripting.registerContentScripts([{ id: 'x', matches: ['<all_urls>'], js: ['content/dyn.js'] }]);\n`,
    'content/dyn.js': "import './helper.js';\n",
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'content/dyn.js');
    assert.match(findings[0].what, /declared in sw\.js/);
  } finally { cleanup(root); }
});

test('content-script-module-syntax: clean for the classic dynamic-import loader (FP guard)', () => {
  // The documented remedy: a classic loader whose only statement is a *dynamic*
  // import. It must never be mistaken for the static form.
  const root = ext({
    'content/main.js': `import(chrome.runtime.getURL('content/app.js'));\nimport ('./other.js');\nconsole.log(import.meta);\n`,
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('content-script-module-syntax: clean when module syntax is only in a comment or a string (FP guard)', () => {
  const root = ext({
    'content/main.js': `// never write: import { a } from './a.js'\n/*\nexport default 1;\n*/\nconst src = \`\nimport { b } from './b.js';\nexport default b;\n\`;\ninject(src);\n`,
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('content-script-module-syntax: does not judge non-injected extension source (FP guard)', () => {
  // The module service worker and page scripts DO load as modules — only the
  // content-script injection surface is classic.
  const root = ext({
    'content/main.js': 'console.log("classic");\n',
    'sw.js': "import { handle } from './lib.js';\nchrome.runtime.onMessage.addListener(handle);\n",
    'panel/panel.js': "export function render() {}\n",
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('content-script-module-syntax: silent in a repo with no extension manifest', () => {
  const root = makeRepo({ changed: { 'src/app.js': "import x from './x.js';\nexport default x;\n" } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
