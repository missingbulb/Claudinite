// THE PAGE'S IMPORT GRAPH MUST STAY BROWSER-PURE.
//
// The dashboard is served as raw ESM: the browser fetches `index.html`, follows its
// module script, and follows every relative import from there — including the reaches
// into `../../engine/`, which is the whole point of the design (the page imports the
// mechanism it renders rather than restating it). Nothing bundles, so there is no build
// step to rewrite a `node:` builtin into something a browser can load. One such import
// anywhere in the graph fails the page's FIRST module load, and the whole dashboard is
// a blank screen.
//
// It fails in the browser and NOWHERE ELSE — every Node test keeps passing, since Node
// resolves `node:fs` happily — so the property is pinned here.
//
// The graph is WALKED rather than listed. A hand-kept list of "the engine modules the
// page imports" is a snapshot of one day's graph: it stayed green while the page grew
// an import of `engine/settings-file.mjs`, which reads the disk (#1286). Walking from
// the real entry point means a module the page starts importing tomorrow is covered the
// day it is imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, '..');
const ROOT = resolve(PAGE, '../..');

// Import statements only. A `from '…'` inside a string literal is prose the page
// renders, not an edge of the graph, so the statement's own keyword has to be there.
const IMPORTS = /(?:^|[\n;])\s*(?:import|export)\b[^;]*?from\s*'([^']+)'/g;

const stripLineComments = (src) => src.replace(/^\s*\/\/.*$/gm, '');

// Every file the browser would load, starting from whatever `index.html` actually
// names — so a renamed entry point re-points the walk instead of silently emptying it.
async function graph() {
  const html = await readFile(resolve(PAGE, 'index.html'), 'utf8');
  const entry = html.match(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/)?.[1];
  assert.ok(entry, 'index.html names no module entry point — the walk would cover nothing');

  const files = new Map();
  const visit = async (file) => {
    if (files.has(file)) return;
    const code = stripLineComments(await readFile(file, 'utf8'));
    files.set(file, code);
    for (const [, spec] of code.matchAll(IMPORTS)) {
      if (!spec.startsWith('.')) continue;                 // judged by the caller, not followed
      await visit(resolve(dirname(file), spec));
    }
  };
  await visit(resolve(PAGE, entry));
  return files;
}

test('every module the page loads is browser-pure', async () => {
  const files = await graph();
  assert.ok(files.size > 20, `the walk reached only ${files.size} files — it is not covering the page`);

  for (const [file, code] of files) {
    const rel = relative(ROOT, file);
    for (const [, spec] of code.matchAll(IMPORTS)) {
      assert.ok(
        spec.startsWith('.'),
        `${rel} imports '${spec}' — the page loads unbundled, so only relative specifiers resolve`,
      );
    }
    assert.doesNotMatch(code, /\brequire\s*\(/, `${rel} uses require()`);
    assert.doesNotMatch(code, /\bprocess\./, `${rel} touches process`);
  }
});

// The reach into the engine is the design, so the walk has to prove it happened: a page
// that stopped importing the engine would satisfy every assertion above trivially.
test('the walk reaches the engine modules the page renders', async () => {
  const files = [...(await graph()).keys()].map((f) => relative(ROOT, f));
  assert.ok(
    files.some((f) => f.startsWith('packs/claudinite-tasks/queue/')),
    'the page no longer imports the queue modules it renders',
  );
});
