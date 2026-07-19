import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../checks/test/helpers.mjs';
import { buildContext } from '../../../checks/lib/context.mjs';
import noEnforcementNarration from './no-enforcement-narration.mjs';
import canonCuration from './pack.mjs';
import { contributedBarrierRules } from '../../../packs/barriers/contributed.mjs';

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

// --- pack-independence (contributed barrier) ---------------------------------
// Built through the real path: this pack's manifest contributes it as DATA and
// the barriers pack builds the rule — packs-tree segregation is barriers
// configuration only, no code here checks anything.
const packIndependence = contributedBarrierRules([{ ...canonCuration, local: true }])
  .find((r) => r.id === 'pack-independence');

test('pack-independence: a cross-pack import fires; own files, the engine surface, and prose stay open', () => {
  const root = makeRepo({ changed: {
    'packs/a/pack.mjs': "import other from '../b/rule.mjs';\nimport own from './own.mjs';\nimport { finding } from '../../checks/lib/findings.mjs';\nimport { loadPacks } from '../registry.mjs';\n",
    'packs/a/own.mjs': 'export default 1;\n',
    'packs/a/README.md': 'Composes with [the b pack](../b/rule.mjs) by declaration.\n',
    'packs/b/rule.mjs': 'export default 1;\n',
    'checks/lib/findings.mjs': 'export const finding = 1;\n',
    'packs/registry.mjs': 'export const loadPacks = 1;\n',
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
    'packs/a/mod.mjs': "import reg from '../../migrations/registry.mjs';\n",
    'migrations/registry.mjs': 'export default 1;\n',
  } });
  const consumer = makeRepo({ changed: {
    'src/app.mjs': "import x from './lib.mjs';\n",
    'src/lib.mjs': 'export default 1;\n',
  } });
  try {
    const f = packIndependence.run(buildContext({ root: crossing, mode: 'all' }));
    assert.equal(f.length, 1);
    assert.match(f[0].what, /migrations\/registry\.mjs/);
    assert.equal(packIndependence.run(buildContext({ root: consumer, mode: 'all' })).length, 0);
  } finally { cleanup(crossing); cleanup(consumer); }
});
