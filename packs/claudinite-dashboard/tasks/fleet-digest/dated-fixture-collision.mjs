import { finding } from '../../../../engine/checks/helpers/findings.mjs';

// Learned in the enforcer repo (#130 there), which `reference-integrity` surfaced only by
// accident. `worker.test.mjs`
// asserted on a `digests/2026-08-…md` path, #127 deleted that brief, and the dangling string
// went red. The dangling reference was the symptom; the defect is that the fixture drew its
// dates from the window the fleet is actually running in, so the paths those assertions build
// share a namespace with real dated artifacts.
//
// That sharing is the whole problem, and it cuts both ways. The failing direction is loud and
// got caught: delete the brief and the assertion breaks. The passing direction is silent and
// would not have been — had a real brief existed at the asserted path, the test would have gone
// green for a reason that has nothing to do with the code under test. A test written that way
// has stopped testing `planBriefs` and started testing repo state.
//
// The enforcer writes a new dated artifact under `digests/` every single morning, so the
// namespace it collides with grows daily and no fixture date in the 2000s is safe for long. A
// year the fleet will never have briefs for cannot collide in either direction.
//
// A check rather than prose: "a test file contains a `digests/<20xx date>` literal" is a static
// signature a post-hoc scan reads straight off the artifact.
//
// BLOCKING, because the silent direction is a test that passes for the wrong reason — the kind
// of green that hides a regression rather than an expected transient. Unlike managed-workflow-drift
// there is no normal window in which a real-dated fixture is correct.
//
// Scope is the declaring repo's own test files. In a member that is everything outside
// `.claudinite/shared/`, the read-only canon mount a consumer may not police; run from canon
// itself the mount does not exist and the skip simply never fires, which is the right answer in
// both places — this rule guards the digest's OWN fixtures, and those live wherever the task does.
const ARTIFACT_DIR = 'digests/';
const MOUNT = '.claudinite/shared/';

// `digests/` followed by a date whose year is 2000-2099 — the range the fleet actually runs in
// and therefore the only range that can collide with a real brief. 1999 (or any non-20xx year)
// is exactly the escape this rule steers toward, so it must not match.
const COLLIDING = /digests\/(20\d\d-\d\d-\d\d)/g;

const rule = {
  id: 'dated-fixture-collision',
  severity: 'blocking',
  description: 'no test fixture builds a digests/ path in the year range the fleet writes real briefs in',
  doc: 'packs/claudinite-dashboard/tasks/fleet-digest/dated-fixture-collision.mjs',
  why: 'a fixture sharing a namespace with real dated artifacts has started depending on repo state — it breaks when a brief is deleted, and passes for the wrong reason when one happens to exist',

  run(ctx) {
    const out = [];
    for (const file of ctx.allFiles) {
      if (!file.endsWith('.test.mjs')) continue;
      if (file.startsWith(MOUNT)) continue; // read-only canon mount, not a member's to police
      const text = ctx.read(file);
      if (text === null || !text.includes(ARTIFACT_DIR)) continue;

      const hits = [...new Set([...text.matchAll(COLLIDING)].map((m) => m[1]))];
      if (hits.length === 0) continue;
      out.push(finding(rule, {
        file,
        what: `builds ${ARTIFACT_DIR} fixture path(s) dated ${hits.join(', ')} — the years the fleet writes real briefs in`,
        fix: 'move the fixture dates to a year the fleet will never have briefs for (the existing fixtures use 1999) so the asserted paths cannot collide with a real brief in either direction',
      }));
    }
    return out;
  },
};

export default rule;
