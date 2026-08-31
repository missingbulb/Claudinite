import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import noEnforcementNarration from '../../../skills/writing-claudinite-skills/no-enforcement-narration.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => noEnforcementNarration.run(buildContext({ root, mode: 'all' }));

// Every fixture spells the REAL layout — a skill lives inside its owning pack,
// `<pack>/skills/<name>/`. These fixtures previously spelled a root-level
// `skills/<name>/`, which no tree has carried since; they
// stayed green against a scan that had stopped matching anything at all, so a
// skill narrating its own enforcement went unflagged. A fixture that encodes a
// layout the repo abandoned proves nothing about the repo.
const SKILL = 'packs/demo/skills/demo/SKILL.md';
const RULE = 'packs/demo/skills/demo/rule.mjs';
const ruleModule = (id) => `const rule = { id: '${id}', run() { return []; } };\nexport default rule;\n`;

test('skill-no-enforcement-narration: a silent SKILL.md beside its check module passes', () => {
  const root = makeRepo({ changed: {
    [SKILL]: '---\nname: demo\n---\n\nDo the activity well.\n',
    [RULE]: ruleModule('demo-rule'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('skill-no-enforcement-narration: flags a SKILL.md telling the reader to run the runner', () => {
  const root = makeRepo({ changed: {
    [SKILL]: '---\nname: demo\n---\n\nWhen done, run `node .claudinite/checks/run.mjs` and fix what fires.\n',
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
    [SKILL]: '---\nname: demo\n---\n\nThe `demo-rule` check enforces the wiring.\n',
    [RULE]: ruleModule('demo-rule'),
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /names its own check rule "demo-rule"/);
  } finally { cleanup(root); }
});

test('skill-no-enforcement-narration: another skill\'s rule id is not "its own"', () => {
  const root = makeRepo({ changed: {
    [SKILL]: '---\nname: demo\n---\n\nSee also the `other-rule` behavior.\n',
    'packs/demo/skills/other/rule.mjs': ruleModule('other-rule'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('skill-no-enforcement-narration: reaches a skill bundled in a local pack', () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/demo/skills/demo/SKILL.md': '---\nname: demo\n---\n\nWhen done, run `node .claudinite/checks/run.mjs`.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /checks runner/);
  } finally { cleanup(root); }
});

// A consumer's mounted skills are symlinks under .claude/skills/ — never the
// pack tree, so the scan must not reach them even when one is somehow tracked.
test('skill-no-enforcement-narration: a mounted .claude/skills/ copy is not a corpus skill', () => {
  const root = makeRepo({ changed: {
    '.claude/skills/demo/SKILL.md': '---\nname: demo\n---\n\nRun `node .claudinite/checks/run.mjs`.\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

// The scan is anchored at a pack tree, which is the whole relevance gate: a repo
// with no `packs/` shelf and no local packs holds no corpus skill to police,
// however many SKILL.md files it keeps elsewhere. The violating text is the same
// one the fixtures above are flagged for, so this asserts the anchor and not the
// matcher.
test('skill-no-enforcement-narration: a SKILL.md outside any pack tree is not a corpus skill', () => {
  const root = makeRepo({ changed: {
    'docs/skills/demo/SKILL.md': '---\nname: demo\n---\n\nWhen done, run `node .claudinite/checks/run.mjs`.\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
