import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/checks/helpers.mjs';
import { buildContext } from '../../engine/checks/lib/context.mjs';
import noEnforcementNarration from '../../skills/writing-claudinite-skills/no-enforcement-narration.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => noEnforcementNarration.run(buildContext({ root, mode: 'all' }));

// The canon-home gate: corpus skills exist only where the registry is tracked.
const CORPUS = { 'engine/skills/registry.mjs': '// registry\n' };

test('skill-no-enforcement-narration: a silent SKILL.md beside its check module passes', () => {
  const root = makeRepo({ changed: {
    ...CORPUS,
    'skills/demo/SKILL.md': '---\nname: demo\n---\n\nDo the activity well.\n',
    'skills/demo/rule.mjs': "const rule = { id: 'demo-rule', run() { return []; } };\nexport default rule;\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('skill-no-enforcement-narration: flags a SKILL.md telling the reader to run the runner', () => {
  const root = makeRepo({ changed: {
    ...CORPUS,
    'skills/demo/SKILL.md': '---\nname: demo\n---\n\nWhen done, run `node .claudinite/checks/run.mjs` and fix what fires.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].line, 5);
    assert.match(findings[0].what, /checks runner/);
  } finally { cleanup(root); }
});

test('skill-no-enforcement-narration: flags a SKILL.md naming a rule its sibling module defines', () => {
  const root = makeRepo({ changed: {
    ...CORPUS,
    'skills/demo/SKILL.md': '---\nname: demo\n---\n\nThe `demo-rule` check enforces the wiring.\n',
    'skills/demo/rule.mjs': "const rule = { id: 'demo-rule', run() { return []; } };\nexport default rule;\n",
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /names its own check rule "demo-rule"/);
  } finally { cleanup(root); }
});

test('skill-no-enforcement-narration: another skill\'s rule id is not "its own"', () => {
  const root = makeRepo({ changed: {
    ...CORPUS,
    'skills/demo/SKILL.md': '---\nname: demo\n---\n\nSee also the `other-rule` behavior.\n',
    'skills/other/rule.mjs': "const rule = { id: 'other-rule', run() { return []; } };\nexport default rule;\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('skill-no-enforcement-narration: inert outside the canon home repo', () => {
  const root = makeRepo({ changed: {
    'skills/demo/SKILL.md': '---\nname: demo\n---\n\nRun `node checks/run.mjs`.\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
