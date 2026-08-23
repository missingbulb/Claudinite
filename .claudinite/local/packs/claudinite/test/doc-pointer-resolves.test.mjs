import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/doc-pointer-resolves.mjs';

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

const ruleModule = (docValue) => `export default {
  id: 'demo-rule',
  severity: 'blocking',
  doc: '${docValue}',
  run(ctx) { return []; },
};
`;

test('doc-pointer-resolves: a repo-root-relative doc: pointing at a moved file fires', () => {
  const root = makeRepo({
    base: {
      'packs/demo/worldRules/demo-rule.mjs': ruleModule('packs/demo/RULES.md'),
      // RULES.md itself is absent — the move this fixture stands in for.
    },
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'doc-pointer-resolves');
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'packs/demo/worldRules/demo-rule.mjs');
    assert.match(findings[0].what, /doc: "packs\/demo\/RULES\.md" resolves to nothing/);
  } finally { cleanup(root); }
});

test('doc-pointer-resolves: a repo-root-relative doc: that resolves is silent', () => {
  const root = makeRepo({
    base: {
      'packs/demo/worldRules/demo-rule.mjs': ruleModule('packs/demo/RULES.md'),
      'packs/demo/RULES.md': '# demo\n',
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('doc-pointer-resolves: a pack-relative doc: unresolvable under either interpretation fires', () => {
  const root = makeRepo({
    base: {
      'packs/demo/worldRules/demo-rule.mjs': ruleModule('skills/renamed-away/SKILL.md'),
    },
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /skills\/renamed-away\/SKILL\.md/);
  } finally { cleanup(root); }
});

test('doc-pointer-resolves: a pack-relative doc: that resolves against the rule\'s own pack is silent', () => {
  const root = makeRepo({
    base: {
      'packs/demo/worldRules/demo-rule.mjs': ruleModule('skills/demo-skill/SKILL.md'),
      'packs/demo/skills/demo-skill/SKILL.md': '# demo skill\n',
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test("doc-pointer-resolves: a doc: substring mid-line inside a template literal is not the field", () => {
  const root = makeRepo({
    base: {
      'packs/demo/worldRules/demo-rule.mjs':
        "export default { id: 'demo-rule', run(ctx) { return [{ what: `doc: \"${'x'}\" is not a field` }]; } };\n",
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('doc-pointer-resolves: a doc: pointer inside a comment is not the field, and never fires', () => {
  const root = makeRepo({
    base: {
      'packs/demo/worldRules/demo-rule.mjs':
        "// example: doc: 'packs/demo/gone.md'\nexport default { id: 'demo-rule', run(ctx) { return []; } };\n",
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('doc-pointer-resolves: a rule module under a pack\'s test/ directory is not scanned', () => {
  const root = makeRepo({
    base: {
      'packs/demo/test/fixtures/demo-rule.mjs': ruleModule('packs/demo/gone.md'),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});
