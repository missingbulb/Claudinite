import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import noEnforcementNarration from './no-enforcement-narration.mjs';

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
