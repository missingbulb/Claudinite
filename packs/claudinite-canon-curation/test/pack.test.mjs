import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../engine/checks/helpers/pattern-rules.mjs';
import noEnforcementNarration from '../worldRules/no-enforcement-narration.mjs';

const run = (root) => noEnforcementNarration.run(buildContext({ root, mode: 'all' }));

const DEMO_PACK = {
  'packs/demo/pack.mjs': "export default { id: 'demo', prose: 'RULES.md', rules: [] };\n",
  'packs/demo/rule.mjs': "const rule = { id: 'demo-rule', run() { return []; } };\nexport default rule;\n",
};

test('pack-no-enforcement-narration: silent prose beside the pack\'s rule module passes', () => {
  const root = makeRepo({ changed: {
    ...DEMO_PACK,
    'packs/demo/RULES.md': '# Demo\n\nDo the work well.\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('pack-no-enforcement-narration: flags prose naming a rule the pack itself defines', () => {
  const root = makeRepo({ changed: {
    ...DEMO_PACK,
    'packs/demo/RULES.md': '# Demo\n\nThe `demo-rule` check enforces this.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'packs/demo/RULES.md');
    assert.equal(findings[0].line, 3);
    assert.match(findings[0].what, /names its own check rule "demo-rule"/);
  } finally { cleanup(root); }
});

test('pack-no-enforcement-narration: flags prose telling the reader to run the runner', () => {
  const root = makeRepo({ changed: {
    ...DEMO_PACK,
    'packs/demo/RULES.md': '# Demo\n\nWhen done, run `node .claudinite/checks/run.mjs`.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /checks runner/);
  } finally { cleanup(root); }
});

test('pack-no-enforcement-narration: the pack README (the rules catalog) is never scanned', () => {
  const root = makeRepo({ changed: {
    ...DEMO_PACK,
    'packs/demo/RULES.md': '# Demo\n\nDo the work well.\n',
    'packs/demo/README.md': '| Rule | How enforced |\n|---|---|\n| Do it | check `demo-rule` |\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('pack-no-enforcement-narration: a prose-less pack contributes nothing', () => {
  const root = makeRepo({ changed: {
    'packs/demo/pack.mjs': "export default { id: 'demo', prose: null, rules: [] };\n",
    'packs/demo/rule.mjs': "const rule = { id: 'demo-rule', run() { return []; } };\nexport default rule;\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

// --- pack-independence (declared barrier) ------------------------------------
// Built through the real path: a forbidReferences entry in this pack's own
// declared-checks.json, compiled by the declarative engine — packs-tree
// segregation is barrier data only, no code here checks anything.
const packIndependence = loadDeclaredChecks(fileURLToPath(new URL('..', import.meta.url)))
  .find((r) => r.id === 'pack-independence');

test('pack-independence: a cross-pack import fires; own files, the engine surface, and prose stay open', () => {
  const root = makeRepo({ changed: {
    'packs/a/pack.mjs': "import other from '../b/rule.mjs';\nimport own from './own.mjs';\nimport { finding } from '../../engine/checks/helpers/findings.mjs';\nimport { loadPacks } from '../registry.mjs';\n",
    'packs/a/own.mjs': 'export default 1;\n',
    'packs/a/README.md': 'Composes with [the b pack](../b/rule.mjs) by declaration.\n',
    'packs/b/rule.mjs': 'export default 1;\n',
    'engine/checks/helpers/findings.mjs': 'export const finding = 1;\n',
    'engine/pack_loader/pack-registry.mjs': 'export const loadPacks = 1;\n',
  } });
  try {
    const findings = packIndependence.run(buildContext({ root, mode: 'all' }));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'packs/a/pack.mjs');
    assert.equal(findings[0].line, 1);
    assert.match(findings[0].what, /packs\/b/);
  } finally { cleanup(root); }
});

test('pack-independence: an import outside the engine surface fires; inert without a packs/ tree', () => {
  const crossing = makeRepo({ changed: {
    // A canon-internal tree that is never vendored — the crossing this rule exists
    // to catch. It was migrations/ until #768 Phase 5 deleted that tree; updates/ is
    // the same shape of target, and equally outside the engine surface a pack may import.
    'packs/a/mod.mjs': "import reg from '../../updates/pack-update.mjs';\n",
    'updates/pack-update.mjs': 'export default 1;\n',
  } });
  const consumer = makeRepo({ changed: {
    'src/app.mjs': "import x from './lib.mjs';\n",
    'src/lib.mjs': 'export default 1;\n',
  } });
  try {
    const f = packIndependence.run(buildContext({ root: crossing, mode: 'all' }));
    assert.equal(f.length, 1);
    assert.match(f[0].what, /updates\/pack-update\.mjs/);
    assert.equal(packIndependence.run(buildContext({ root: consumer, mode: 'all' })).length, 0);
  } finally { cleanup(crossing); cleanup(consumer); }
});
