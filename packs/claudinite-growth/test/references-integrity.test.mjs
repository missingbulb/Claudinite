import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/references-integrity.mjs';

const PACK = '.claudinite/local/packs/mypack/';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('references-integrity: is inert when no pack carries markers or a references doc', () => {
  assert.deepEqual(run({
    [`${PACK}RULES.md`]: '- **Doing a thing** — do it well, with no recorded rationale.\n',
    'src/app.js': 'x\n',
  }), []);
});

test('references-integrity: a marker resolving to its entry is clean', () => {
  assert.deepEqual(run({
    [`${PACK}RULES.md`]: '- **Doing a thing** — do it the settled way. (3)\n',
    [`${PACK}references.md`]: '- **(RULES-3)** Doing it the other way failed twice (#12).\n',
  }), []);
});

test('references-integrity: a multi-citation marker resolves each number', () => {
  const files = {
    [`${PACK}RULES.md`]: '- **Doing a thing** — do it the settled way. (3, 7)\n',
    [`${PACK}references.md`]: '- **(RULES-3)** First reason.\n- **(RULES-7)** Second reason.\n',
  };
  assert.deepEqual(run(files), []);
  files[`${PACK}references.md`] = '- **(RULES-3)** First reason.\n';
  const findings = run(files);
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /\(7\)/);
});

test('references-integrity: flags a marker with no references doc beside the pack', () => {
  const findings = run({
    [`${PACK}RULES.md`]: '- **Doing a thing** — do it the settled way. (3)\n',
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.match(findings[0].what, /no references\.md/);
});

test('references-integrity: flags a marker whose number has no entry', () => {
  const findings = run({
    [`${PACK}RULES.md`]: '- **Doing a thing** — do it the settled way. (4)\n',
    [`${PACK}references.md`]: '- **(RULES-3)** A reason for a different rule.\n',
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /\(4\)/);
});

test('references-integrity: reads SKILL.md markers too', () => {
  const findings = run({
    [`${PACK}skills/do-a-thing/SKILL.md`]: 'Step one, because it is settled. (9)\n',
    [`${PACK}references.md`]: '- **(do-a-thing-3)** Unrelated.\n',
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].file, /SKILL\.md$/);
});

test('references-integrity: namespaces are per file — a RULES.md marker never resolves through a skill\'s entry', () => {
  const findings = run({
    [`${PACK}RULES.md`]: '- **Doing a thing** — the settled way. (3)\n',
    [`${PACK}skills/do-a-thing/SKILL.md`]: 'Step one, because it is settled. (3)\n',
    [`${PACK}references.md`]: '- **(do-a-thing-3)** The skill\'s reason.\n',
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].file, /RULES\.md$/);
  assert.match(findings[0].what, /RULES-3/);
});

test('references-integrity: an inline issue id or an ordinary parenthetical is not a marker', () => {
  assert.deepEqual(run({
    [`${PACK}RULES.md`]: [
      '- **Doing a thing** — do it (#1119).',
      '- **Doing another** — with the flag (see below).',
      '- **Counting** — got it right 5 runs in 5.',
    ].join('\n') + '\n',
  }), []);
});

test('references-integrity: a check entry naming a declared check is clean, an unknown one flags', () => {
  const files = {
    [`${PACK}declared-checks.json`]: '[ { "id": "my-check", "severity": "advisory", "failureMessage": "m" } ]\n',
    [`${PACK}references.md`]: '- **(check:my-check)** The reason the check exists.\n',
  };
  assert.deepEqual(run(files), []);
  files[`${PACK}references.md`] = '- **(check:retired-check)** A reason for a check that is gone.\n';
  const findings = run(files);
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /retired-check/);
});

test('references-integrity: a slashed check id resolves and a dangling slashed one flags', () => {
  const files = {
    [`${PACK}worldRules/handler-path.mjs`]: "const rule = { id: 'mypack/handler-path', severity: 'blocking' };\nexport default rule;\n",
    [`${PACK}references.md`]: '- **(check:mypack/handler-path)** The reason.\n',
  };
  assert.deepEqual(run(files), []);
  files[`${PACK}references.md`] = '- **(check:mypack/gone-check)** A reason for a check that is gone.\n';
  const findings = run(files);
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /mypack\/gone-check/);
});

test('references-integrity: a check entry naming a coded rule module is clean', () => {
  assert.deepEqual(run({
    [`${PACK}worldRules/my-rule.mjs`]: "const rule = { id: 'my-coded-rule', severity: 'blocking' };\nexport default rule;\n",
    [`${PACK}references.md`]: '- **(check:my-coded-rule)** The reason.\n',
  }), []);
});

test('references-integrity: canon-root packs/ are scanned the same way', () => {
  const findings = run({
    'packs/somepack/RULES.md': '- **Doing a thing** — the settled way. (2)\n',
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /no references\.md/);
});
