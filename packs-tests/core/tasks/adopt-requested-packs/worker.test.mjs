import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, openWorkLists } from '../../../../packs/core/tasks/adopt-requested-packs/worker.mjs';
import { LABEL } from '../../../../packs/core/tasks/adopt-requested-packs/protocol.mjs';

// The code-work gate: request the agent iff this repo has an open `add-packs` work
// list. Exercised through the real main() with fetch stubbed, because the property
// under test is the END-TO-END decision — env in, request file (or its absence) out.

function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.fetch = original; });
}

const issuesResponse = (items) => async (url) => {
  assert.match(String(url), new RegExp(`labels=${LABEL}`)); // the protocol label, not a private spelling
  return { status: 200, json: async () => items };
};

function scratchEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'adopt-req-'));
  const requestPath = join(dir, 'request');
  const saved = { ...process.env };
  process.env.GITHUB_REPOSITORY = 'acme/app';
  process.env.GITHUB_TOKEN = 't';
  process.env.CLAUDINITE_REQUEST_AGENT = requestPath;
  return {
    requestPath,
    restore() {
      process.env = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('an open work list requests the agent, naming the condition and the issues', async () => {
  const env = scratchEnv();
  try {
    await withFetch(issuesResponse([{ number: 12, title: 'Add packs: requested for this repo' }]), main);
    assert.ok(existsSync(env.requestPath), 'the request file is the handoff — without it no agent ever runs');
    const payload = JSON.parse(readFileSync(env.requestPath, 'utf8'));
    assert.equal(payload.reason.code, 'add-packs-work-list');
    assert.match(payload.reason.detail, /#12/);
  } finally {
    env.restore();
  }
});

test('an empty work list requests nothing — a re-fire after the work landed is a quiet no-op', async () => {
  const env = scratchEnv();
  try {
    await withFetch(issuesResponse([]), main);
    assert.ok(!existsSync(env.requestPath));
  } finally {
    env.restore();
  }
});

test('a PR carrying the label is not a work list', async () => {
  // The issues API returns PRs too; a labelled PR must not wake the agent.
  const env = scratchEnv();
  try {
    await withFetch(issuesResponse([{ number: 3, title: 'x', pull_request: {} }]), main);
    assert.ok(!existsSync(env.requestPath));
  } finally {
    env.restore();
  }
});

test('an unreadable issue list fails the run rather than deciding quietly', async () => {
  // "Could not read the work list" must never become "there is no work" — the
  // scheduler turns the non-zero exit into a needs-human issue.
  const env = scratchEnv();
  try {
    await withFetch(async () => ({ status: 500, json: async () => ({}) }), () =>
      assert.rejects(main, /returned 500/));
  } finally {
    env.restore();
  }
});

test('openWorkLists filters PRs and returns issues as-is', async () => {
  const items = [{ number: 1 }, { number: 2, pull_request: {} }];
  await withFetch(issuesResponse(items), async () => {
    const open = await openWorkLists('acme/app', 't');
    assert.deepEqual(open.map((i) => i.number), [1]);
  });
});
