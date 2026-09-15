import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE TREE THIS GUARD EXISTS FOR IS THE ONE IT CANNOT SEE UNLESS ITS SCOPE SAYS SO.
// `tasks-pack-read-through-its-surface` keeps a consumer off this pack's internals. The
// consumers that can actually get it wrong are members: a canon pack lives beside the
// barrier and is swept whenever the canon is, while a member's `.claudinite/local/packs/`
// is the one tree no converge may rewrite, so a deep import written there survives every
// update until it crashes.
//
// It was written scanning `packs/` with an optional `.claudinite/shared/` prefix, and that
// prefix is dead on arrival: repo-context strips every path under the shared mount from
// the scan set before any check runs, because the vendored corpus is canon-owned. A member
// has no top-level `packs/` at all. So in a member the rule selected NOTHING and read as
// passing — which is how Shepherd's five deep imports went un-flagged into production
// (missingbulb/Shepherd#613).
//
// Pinned by MATCHING PATHS rather than by a fixture tree: the scope is a claim about where
// files live in a member, and a fixture spelling that layout would prove only that the
// fixture matches itself.

const HERE = dirname(fileURLToPath(import.meta.url));
const DECLARED = JSON.parse(readFileSync(join(HERE, '..', 'declared-checks.json'), 'utf8'));

const rule = DECLARED.find((c) => c.id === 'tasks-pack-read-through-its-surface');

// A declared pattern is a string wearing slashes; the engine compiles it the same way.
const compile = (s) => {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(s);
  assert.ok(m, `not a declared pattern: ${s}`);
  return new RegExp(m[1], m[2]);
};

test('the surface guard scopes to both trees a consumer can write in', () => {
  const scope = compile(rule.scanFiles);

  // The canon's own shelf — a sibling pack importing this one.
  assert.ok(scope.test('packs/claudinite-dashboard/src/derive/model.mjs'),
    'a canon sibling must stay in scope');

  // A MEMBER'S OWN PACK. The tree no converge rewrites, and the only one where a bad
  // import can survive. This is the case Shepherd#613 needed and did not get.
  assert.ok(scope.test('.claudinite/local/packs/shepherd/tasks/fleet-issues-snapshot/worker.mjs'),
    "a member's own pack must be in scope — it is the tree no converge can repair");

  // `.js`, not only `.mjs`. The canon is all-ESM by convention, so a scope written here
  // reads as complete while missing a whole file type a member is free to use — and does:
  // GoogleCalendarEventCreator reaches this pack from two `.js` test files, which an
  // `\.mjs$` scope skipped in silence.
  assert.ok(scope.test('.claudinite/local/packs/gcec/tasks/create-extractor/test/task.test.js'),
    "a member's .js file must be in scope — the canon's all-ESM habit is not a member's");

  // This pack's own modules import their own internals; that is not a crossing.
  assert.equal(scope.test('packs/claudinite-tasks/src/items/work-item.mjs'), false,
    'the pack may read itself');
  assert.equal(scope.test('.claudinite/local/packs/claudinite-tasks/src/x.mjs'), false,
    'the exemption must hold under the member prefix too');
});

test('the guard fires on a member-shaped deep import and stays silent on the surface', () => {
  const match = compile(rule.matchLines[0].match);

  // Verbatim from Shepherd's own local pack at the commit that broke it.
  const deep = "import { deliverGenerated } from '../../../../../shared/packs/claudinite-tasks/deliver-generated.mjs';";
  assert.ok(match.test(deep), 'a member reaching past the surface must be caught');

  const viaSurface = "import { deliverGenerated } from '../../../../../shared/packs/claudinite-tasks/public/delivery.mjs';";
  assert.equal(match.test(viaSurface), false, 'the published surface is the sanctioned reach');
});
