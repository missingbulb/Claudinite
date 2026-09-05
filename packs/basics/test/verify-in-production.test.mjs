// The verify-in-production skill (#1091) rides the request lane — the queue is the
// delayed-execution mechanism, so the skill's whole contract is prose. What is
// tested is that the two templates it prescribes are ones the queue's own parsers
// read back; the Not-before adoption carry it leans on is engine behaviour, tested
// in packs/claudinite-tasks/test/queue/request-mode.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRequestFields } from '../../claudinite-tasks/queue/work-item.mjs';
import { parseVerificationSpec, parseRetryEvery, RETRY_FIELD } from '../../claudinite-tasks/tasks/verify-production/probes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(here, '../skills/verify-in-production/SKILL.md'), 'utf8');

// The two templates are the fenced blocks that open on the original issue: one
// coded (probes a worker fetches), one agentic (a GitHub read a session makes).
// Their `<placeholder>` values are filled with one plausible value per field.
const templates = [...skill.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => b.startsWith('Original-issue:'));
const SAMPLES = {
  'Original-issue': '#1286',
  'Live-probe': 'https://x.github.io/r/stamp.json :: json packVersions.basics >= 60821.3',
  'Verify-probe': 'https://x.github.io/r/ :: status 200',
  'Retry-every': '6 hours',
  'Not-before': '2026-09-10T00:00:00Z',
  'In-production-when': 'the stamp carries the new version',
  Verify: 'the page answers 200',
};
const fill = (block) => block.split('\n').map((line) => {
  const field = /^([A-Za-z-]+):/.exec(line)?.[1];
  return field && line.includes('<') && SAMPLES[field] ? `${field}: ${SAMPLES[field]}` : line;
}).join('\n');

test('the skill prescribes one coded template and one agentic one', () => {
  assert.equal(templates.length, 2, 'a third would be a form nobody defined');
});

test('the coded template parses into a complete probe spec, routed to a task that exists, with no session', () => {
  const coded = fill(templates[0]);
  const spec = parseVerificationSpec(coded);
  assert.deepEqual(spec.problems, []);
  assert.equal(spec.live.length, 1, 'the liveness gate — without it "not deployed" reads as "broken"');
  assert.equal(spec.verify.length, 1, 'the assertion the probes exist for');
  assert.equal(spec.originalIssue, 1286, 'a failing run reopens the original issue');
  assert.equal(spec.retryEveryMs, 6 * 3_600_000);
  const fields = parseRequestFields(coded, { gated: true });
  assert.ok(fields.task, 'nothing routes the issue to the coded runner');
  assert.ok(existsSync(join(here, '../../', fields.task.replace('/', '/tasks/'))), `${fields.task} names no task directory`);
  assert.equal(fields.model, null, 'no session ever runs a coded verification, so no family is chosen');
  assert.deepEqual(fields.blockedBy, [], 'filed after the merge, so nothing is left to wait on but the release');
  assert.equal(fields.notBefore, null, 'a coded run costs seconds — probing from the moment of filing is the point');
});

test('the agentic template parses into a sleeping session with a re-arm cadence and no blocker', () => {
  const agentic = fill(templates[1]);
  const fields = parseRequestFields(agentic, { gated: true });
  assert.equal(fields.model, 'sonnet');
  assert.equal(fields.notBefore, SAMPLES['Not-before'], 'without the delay the run fires before the release it waits on');
  assert.deepEqual(fields.blockedBy, [], 'filed after the merge, so nothing is left to wait on but the release');
  assert.equal(fields.merge, null, 'a verification has nothing to merge');
  const retry = new RegExp(`^${RETRY_FIELD}:[ \\t]*(.+)$`, 'm').exec(agentic)?.[1];
  assert.ok(parseRetryEvery(retry) > 0, `${RETRY_FIELD} must read as a cadence, or a not-yet-live run cannot re-arm`);
});
