import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Bootstrap (bootstrap.md) STANDS UP a Claudinite consumer; baselining
// (packs/basics/tasks/baselining/task.md) is "is Claudinite STILL set up correctly"
// — the periodic realignment. Every artifact bootstrap creates can later drift (a
// deleted workflow, a removed routine, an unanswered interview after a pack change),
// so realignment must re-verify/repair the SAME surface, or a broken mechanism stays
// silently broken forever. This pins that parity: the canonical setup-artifact list
// below must be addressed by BOTH docs. A bootstrap step with no realignment
// counterpart is the bug this guards against.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = readFileSync(join(root, 'bootstrap.md'), 'utf8');
const baselining = readFileSync(join(root, 'packs/basics/tasks/baselining/task.md'), 'utf8');

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
      a.match.test(baselining),
      `baselining task.md does not address ${a.id} — bootstrap creates it but realignment never re-verifies it, so a drifted ${a.id} would never be repaired`,
    );
  });
}
