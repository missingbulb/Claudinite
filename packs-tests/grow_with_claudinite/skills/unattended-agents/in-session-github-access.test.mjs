import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import rule from '../../../../packs/grow_with_claudinite/skills/unattended-agents/in-session-github-access.mjs';

// Co-located with the check it exercises (skills own their test-the-world checks).
const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

test('in-session-github-access: in-session code using injected MCP I/O passes', () => {
  const root = makeRepo({ changed: {
    'migrations/fleet-apply.mjs': 'export async function apply(io, r) { return io.commit(r, "main", [], "m"); }\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('in-session-github-access: flags a GITHUB_TOKEN read in migration-pass code', () => {
  const root = makeRepo({ changed: {
    'migrations/fleet-apply.mjs': 'const token = process.env.GITHUB_TOKEN;\nexport const t = token;\n',
  } });
  try {
    const f = run(root);
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'blocking');
    assert.equal(f[0].file, 'migrations/fleet-apply.mjs');
    assert.match(f[0].what, /REST token/);
  } finally { cleanup(root); }
});

test('in-session-github-access: flags a REST client (makeGh / fleet-api) in a migration pass', () => {
  const file = 'migrations/some-pass.mjs';
  const root = makeRepo({ changed: {
    [file]: "import { makeGh } from '../packs/sheepdog/fleet-api.mjs';\nexport const gh = makeGh('t');\n",
  } });
  try {
    const f = run(root);
    assert.ok(f.length >= 1);
    assert.ok(f.every((x) => x.file === file));
    assert.match(f[0].what, /REST client/);
  } finally { cleanup(root); }
});

test('in-session-github-access: a run_daily/ path is no longer an in-session surface', () => {
  // The central planner that dispatched run_daily descriptors into an MCP-only
  // session retired with #394, and no repo carries them any more — so the scope
  // arm went with it. Drift guard: if run_daily/ is ever re-added to IN_SESSION
  // without a planner to justify it, this fails.
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/x/run_daily/task.mjs': 'const t = process.env.GITHUB_TOKEN;\nexport const y = t;\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('in-session-github-access: a scheduled task\'s preprocessing worker keeps its REST client', () => {
  // prework runs Action-side as a subprocess with an injected
  // GITHUB_TOKEN — the one sanctioned non-MCP surface — so tasks/ is deliberately
  // outside the in-session scope.
  const root = makeRepo({ changed: {
    'packs/basics/tasks/baselining/worker.mjs': "const t = process.env.GITHUB_TOKEN;\nconst r = await fetch('https://api.github.com/repos/x');\nexport const y = [t, r];\n",
  } });
  try {
    assert.equal(run(root).length, 0, 'a task worker is Action-side code, not in-session code');
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
    'packs/sheepdog/tasks/fleet-census/check-fleet-coverage.mjs': 'const token = process.env.FLEET_GITHUB_TOKEN;\nexport const t = token;\n',
  } });
  try {
    assert.equal(run(root).length, 0, 'the census (a workflow-invoked executor) keeps its REST client');
  } finally { cleanup(root); }
});

test('in-session-github-access: a comment mentioning GITHUB_TOKEN does not false-positive', () => {
  const root = makeRepo({ changed: {
    'migrations/fleet-apply.mjs': '// There is no GITHUB_TOKEN here and no fetch to api.github.com.\nexport const ok = true;\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
