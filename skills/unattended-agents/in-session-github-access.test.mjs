import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import rule from './in-session-github-access.mjs';

// Co-located with the check it exercises (skills own their test-the-world checks).
const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

test('in-session-github-access: in-session code using injected MCP I/O passes', () => {
  const root = makeRepo({ changed: {
    'routines/fleet/plan.mjs': 'export async function plan(gh, repos) { return gh(`/repos/${repos[0]}`); }\n',
    'migrations/fleet-apply.mjs': 'export async function apply(io, r) { return io.commit(r, "main", [], "m"); }\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('in-session-github-access: flags a GITHUB_TOKEN read in routine code', () => {
  const root = makeRepo({ changed: {
    'routines/fleet/plan.mjs': 'const token = process.env.GITHUB_TOKEN;\nexport const t = token;\n',
  } });
  try {
    const f = run(root);
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'blocking');
    assert.equal(f[0].file, 'routines/fleet/plan.mjs');
    assert.match(f[0].what, /REST token/);
  } finally { cleanup(root); }
});

test('in-session-github-access: flags a REST client (makeGh / fleet-api) in a run_daily task', () => {
  const root = makeRepo({ changed: {
    'packs/x/run_daily/task.mjs': "import { makeGh } from '../../../routines/fleet/fleet-api.mjs';\nexport const gh = makeGh('t');\n",
  } });
  try {
    const f = run(root);
    assert.ok(f.length >= 1);
    assert.ok(f.every((x) => x.file === 'packs/x/run_daily/task.mjs'));
    assert.match(f[0].what, /REST client/);
  } finally { cleanup(root); }
});

test('in-session-github-access: flags a raw api.github.com fetch in a migration', () => {
  const root = makeRepo({ changed: {
    'migrations/fleet-apply.mjs': 'const r = await fetch(`https://api.github.com/repos/${x}`);\nexport const y = r;\n',
  } });
  try {
    const f = run(root);
    assert.equal(f.length, 1);
    assert.match(f[0].what, /api\.github\.com/);
  } finally { cleanup(root); }
});

test('in-session-github-access: a dispatch-only executor outside the in-session trees is not scanned', () => {
  const root = makeRepo({ changed: {
    'packs/sheepdog/check-fleet-coverage.mjs': 'const token = process.env.FLEET_GITHUB_TOKEN;\nexport const t = token;\n',
  } });
  try {
    assert.equal(run(root).length, 0, 'the census (a workflow-invoked executor) keeps its REST client');
  } finally { cleanup(root); }
});

test('in-session-github-access: a comment mentioning GITHUB_TOKEN does not false-positive', () => {
  const root = makeRepo({ changed: {
    'routines/fleet/plan.mjs': '// There is no GITHUB_TOKEN here and no fetch to api.github.com.\nexport const ok = true;\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
