import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Bootstrap (bootstrap.md) STANDS UP a Claudinite consumer; the update task
// (packs/basics/tasks/update/task.md) is "is Claudinite STILL set up correctly"
// — the periodic realignment. Every artifact bootstrap creates can later drift (a
// deleted workflow, a removed routine, an unanswered interview after a pack change),
// so realignment must re-verify/repair the SAME surface, or a broken mechanism stays
// silently broken forever. This pins that parity: the canonical setup-artifact list
// below must be addressed by BOTH SIDES. A bootstrap step with no realignment
// counterpart is the bug this guards against.
//
// The realignment side is a SURFACE, not one document. Under baselining it was a
// single agent brief that described the whole repair; the update flows do that work
// deterministically (#768), and their task.md deliberately scopes the agent to the
// apply stage alone — so demanding the brief describe the mechanical converge would
// push prose into a doc whose whole point is telling the agent not to do it. What
// must exist is a repairer SOMEWHERE, so the surface is the task doc plus the flows
// that perform the repair.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = readFileSync(join(root, 'bootstrap.md'), 'utf8');
const realignment = [
  'packs/basics/tasks/update/task.md',
  'packs/basics/tasks/update/worker.mjs',
  'updates/engine-update.mjs',
  'updates/pack-update.mjs',
  'updates/install.mjs',
  'engine/scheduler/converge-wiring.mjs',
].map((f) => readFileSync(join(root, f), 'utf8')).join('\n');

// Each artifact: an id and a matcher that must hit in both docs. Matchers are the
// artifact's load-bearing name, specific enough that a doc merely mentioning the
// area in passing doesn't satisfy it.
const SETUP_ARTIFACTS = [
  { id: 'vendored mount', match: /\.claudinite\/shared\b/ },
  { id: 'SessionStart/Stop hook registrations', match: /\bhook(s|-registration)?\b/i },
  { id: 'the scheduler workflow', match: /claudinite-scheduler\.yml/ },
  { id: 'the label-wired executor routine', match: /executor routine/i },
  { id: 'the pack-adoption interview (answered when packs change)', match: /\binterview\b/i },
];

for (const a of SETUP_ARTIFACTS) {
  test(`bootstrap stands up "${a.id}"`, () => {
    assert.ok(a.match.test(bootstrap), `bootstrap.md does not address ${a.id}`);
  });
  test(`realignment repairs "${a.id}"`, () => {
    assert.ok(
      a.match.test(realignment),
      `no part of the realignment surface addresses ${a.id} — bootstrap creates it but realignment never re-verifies it, so a drifted ${a.id} would never be repaired`,
    );
  });
}
