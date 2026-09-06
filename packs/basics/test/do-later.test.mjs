// `/do-later` files an ad-hoc request whose whole contract is prose — the queue is
// the mechanism, and the skill is what decides the body's shape. What is tested is
// that the template the skill prescribes is one the queue's own parser reads back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRequestFields } from '../../claudinite-tasks/queue/work-item.mjs';

const skill = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../skills/do-later/SKILL.md'), 'utf8');

// The template is the first fenced block that opens on the wait fields. Its
// `<placeholder>` values are filled with one plausible value per field, so the
// parser sees exactly the body a filer following the skill would write.
const template = [...skill.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => b.startsWith('Blocked-by:'));
const SAMPLES = {
  'Blocked-by': '#1456', 'Not-before': '2026-09-10T00:00:00Z', Model: 'sonnet', Automerge: 'if-narrow', Task: 'basics/ci-performance',
};
const filled = template.split('\n').map((line) => {
  const field = /^([A-Za-z-]+):/.exec(line)?.[1];
  return field && line.includes('<') && SAMPLES[field] ? `${field}: ${SAMPLES[field]}` : line;
}).join('\n');

test('the queue reads every field the template prescribes back from a body written to it', () => {
  const gated = parseRequestFields(filled, { gated: true });
  assert.deepEqual(gated.blockedBy, [1456], 'Blocked-by is what serializes the chain');
  assert.equal(gated.notBefore, SAMPLES['Not-before']);
  assert.equal(gated.model, 'sonnet');
  assert.equal(gated.task, 'basics/ci-performance');
  assert.ok(gated.merge, 'Automerge must read as a policy expression');
  // An ungated author still gets the two waits — they define when, not what.
  const ungated = parseRequestFields(filled);
  assert.deepEqual(ungated.blockedBy, [1456]);
  assert.equal(ungated.notBefore, SAMPLES['Not-before']);
});
