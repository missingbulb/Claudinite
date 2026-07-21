import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/checks/helpers.mjs';
import { buildContext } from '../../engine/checks/lib/context.mjs';
import routineStructure from '../../skills/unattended-agents/routine-structure.mjs';

// Co-located with the check it exercises (skills own their test-the-world checks).
const run = (root) => routineStructure.run(buildContext({ root, mode: 'all' }));

const CLEAN_ROUTINE = {
  'dev/routines/demo/routine.md':
    '# Demo\n\n## 1. Precondition\n\n```sh\nbash dev/routines/demo/preconditions.sh\n```\n\n## 2. Finish\n\nThen `bash dev/routines/demo/postconditions.sh`.\n',
  'dev/routines/demo/preconditions.sh': '#!/usr/bin/env bash\nexit 0\n',
  'dev/routines/demo/postconditions.sh': '#!/usr/bin/env bash\nexit 0\n',
};

test('routine-structure: a well-formed routine passes', () => {
  const root = makeRepo({ changed: CLEAN_ROUTINE });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('routine-structure: flags a routine.md invoking a script that does not exist', () => {
  const root = makeRepo({ changed: {
    'dev/routines/demo/routine.md': 'Run `bash dev/routines/demo/preconditions.sh` first.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.match(findings[0].what, /does not exist/);
  } finally { cleanup(root); }
});

test('routine-structure: flags a script the entry point never invokes (orphan)', () => {
  const root = makeRepo({ changed: {
    'dev/routines/demo/routine.md': '# Demo\n\nNothing is run here.\n',
    'dev/routines/demo/helper.sh': '#!/usr/bin/env bash\nexit 0\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(findings[0].file, 'dev/routines/demo/helper.sh');
    assert.match(findings[0].what, /never invoked/);
  } finally { cleanup(root); }
});

test('routine-structure: flags phase scripts in a folder with no routine.md entry point', () => {
  const root = makeRepo({ changed: {
    'dev/routines/demo/preconditions.sh': '#!/usr/bin/env bash\nexit 0\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.match(findings[0].what, /entry point/);
  } finally { cleanup(root); }
});

test('routine-structure: flags a script with no shebang', () => {
  const root = makeRepo({ changed: {
    'dev/routines/demo/routine.md': 'Run `bash dev/routines/demo/preconditions.sh`.\n',
    'dev/routines/demo/preconditions.sh': 'echo no shebang here\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.match(findings[0].what, /shebang/);
  } finally { cleanup(root); }
});
