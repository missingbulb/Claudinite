// `/do-later` files an ad-hoc request whose whole contract is prose — the queue is
// the mechanism, and the skill is what decides the body's shape. These pin the parts
// the machinery reads back: the mark, the wait fields, and where the parameters sit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../skills/do-later/SKILL.md'), 'utf8');

test('the filed issue carries the mark and the wait fields the scheduler run reads', () => {
  assert.match(skill, /`task:origin:ad-hoc`/,
    'the mark is what makes the scheduler run adopt the issue');
  assert.match(skill, /^Blocked-by: #/m);
  assert.match(skill, /^Not-before: /m);
});

// THE PARAMETERS LEAD THE BODY (#1456). Every field a run reads — the waits, the
// model, the task, the authorization — is one block on the first lines, above the
// prose. Scattered, as on #1160, nobody editing the issue can see what the run will
// do, and a retry rewriting `Not-before` has no single place to write it.
test('the parameters are one block on the first lines, ahead of the prose', () => {
  assert.match(skill, /first lines/i,
    'nothing places the parameter block, so filers scatter the fields through the prose');
  const template = /```\n(Blocked-by:[\s\S]*?)```/.exec(skill)?.[1] ?? '';
  assert.match(template, /^Model:/m,
    'Model: is prescribed away from the wait fields — the scattering #1160 shows');
});
