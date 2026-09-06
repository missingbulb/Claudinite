// The production-retrospective skill (#1501) rides the same request lane as
// verify-in-production — the queue is the delayed-execution mechanism, so the
// skill's whole contract is prose. What is tested is that the template it
// prescribes is one the queue's own parsers read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRequestFields } from '../../claudinite-tasks/queue/work-item.mjs';
import { parseRetryEvery, RETRY_FIELD } from '../../claudinite-tasks/tasks/verify-production/probes.mjs';

const skill = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../skills/production-retrospective/SKILL.md'), 'utf8');

// The template is the fenced block that opens on the wait fields. Its
// `<placeholder>` values are filled with one plausible value per field, and the
// "(chain case)" / "(merge case)" annotations beside them are template commentary,
// not body text.
const template = [...skill.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => b.startsWith('Blocked-by:'));
const SAMPLES = { 'Blocked-by': '#1700', 'Not-before': '2026-09-17T00:00:00Z' };
const filled = template.split('\n').map((line) => {
  const field = /^([A-Za-z-]+):/.exec(line)?.[1];
  return field && line.includes('<') && SAMPLES[field] ? `${field}: ${SAMPLES[field]}` : line.replace(/\s+\([a-z ]+ case\)\s*$/, '');
}).join('\n');

test('the queue reads the retrospective template back: both waits, an opus session, a re-arm cadence, nothing to merge', () => {
  const fields = parseRequestFields(filled, { gated: true });
  assert.deepEqual(fields.blockedBy, [1700], 'the chain case waits on the final link');
  assert.equal(fields.notBefore, SAMPLES['Not-before'], 'the merge case sleeps to the horizon');
  assert.equal(fields.model, 'opus', 'an open review is judgment work, not a field read');
  assert.equal(fields.merge, null, 'a retrospective has nothing to merge');
  const retry = new RegExp(`^${RETRY_FIELD}:[ \\t]*(.+)$`, 'm').exec(filled)?.[1];
  assert.ok(parseRetryEvery(retry) > 0, `${RETRY_FIELD} must read as a cadence, or a thin record cannot re-arm`);
});
