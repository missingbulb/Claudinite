// WHAT THE TWO WORKFLOWS DELEGATE TO. `.github/workflows/` is the one vendored
// path a converge cannot push into — a member's copy moves only through a PR a
// human merges — so the logic these tests cover was moved OUT of the YAML and
// into the engine, where it converges nightly like everything else. These pin
// the behaviour at its new home, and the drift tests in converge-wiring pin that
// the YAML still only names it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reportWorkflowFailure, findOpenFailureIssue, FAILURE_LABELS, WORKFLOW_FAILURE, runUrl,
} from '../../../engine/scheduler/queue/workflow-failure.mjs';
import {
  continueOrEscalate, nextDepth, MAX_DEPTH, CHAIN_FAILURE_TITLE,
} from '../../../engine/scheduler/queue/executor-continuation.mjs';

// A fake `gh` recording every write, answering the search from `items`.
const fakeGh = ({ items = [], searchStatus = 200, dispatchStatus = 204, createStatus = 201 } = {}) => {
  const calls = [];
  const gh = async (path, opts = {}) => {
    calls.push({ path, ...opts });
    if (path.startsWith('/search/issues')) {
      return { status: searchStatus, json: searchStatus === 200 ? { items } : null };
    }
    if (path.endsWith('/dispatches')) return { status: dispatchStatus, json: null };
    if (/\/issues$/.test(path) && opts.method === 'POST') {
      return { status: createStatus, json: createStatus < 300 ? { number: 4242 } : { message: 'no' } };
    }
    return { status: 200, json: {} };
  };
  gh.calls = calls;
  return gh;
};

const REPO = 'owner/name';

// --- the failure escalation ------------------------------------------------

test('a first failure files the issue, labelled and with its labels ensured first', async () => {
  const gh = fakeGh();
  const res = await reportWorkflowFailure(gh, REPO, { title: 'It broke', body: 'here is why' });
  assert.deepEqual(res, { issue: 4242, created: true });

  const labelWrites = gh.calls.filter((c) => c.path === `/repos/${REPO}/labels`);
  const create = gh.calls.findIndex((c) => c.path === `/repos/${REPO}/issues` && c.method === 'POST');
  assert.equal(labelWrites.length, FAILURE_LABELS.length, 'every label it applies is ensured');
  assert.ok(gh.calls.indexOf(labelWrites.at(-1)) < create,
    'ensured BEFORE the create — applying an unknown label 422s the write');
  assert.deepEqual(gh.calls[create].body.labels, FAILURE_LABELS.map((l) => l.name));
});

test('a second failure comments on the open issue rather than filing another', async () => {
  const gh = fakeGh({ items: [{ number: 7, title: 'It broke' }] });
  const res = await reportWorkflowFailure(gh, REPO, { title: 'It broke', body: 'again' });
  assert.deepEqual(res, { issue: 7, created: false });
  assert.ok(gh.calls.some((c) => c.path === `/repos/${REPO}/issues/7/comments`), 'it commented');
  assert.ok(!gh.calls.some((c) => c.path === `/repos/${REPO}/issues` && c.method === 'POST'),
    'and filed nothing — one open issue per title, however many nights it fails');
});

test('the title match is exact, and a past race converges on the lowest number', async () => {
  const gh = fakeGh({ items: [
    { number: 9, title: 'It broke' },
    { number: 3, title: 'It broke' },
    { number: 1, title: 'It broke, and then some' },
  ] });
  assert.equal(await findOpenFailureIssue(gh, REPO, 'It broke'), 3);
});

// A search that does not answer must not lose the report: filing a second issue is
// untidy, dropping the only human-visible record of a red run is not.
test('a search that fails files rather than going quiet', async () => {
  const gh = fakeGh({ searchStatus: 503 });
  assert.equal(await findOpenFailureIssue(gh, REPO, 'It broke'), null);
  const res = await reportWorkflowFailure(gh, REPO, { title: 'It broke', body: 'b' });
  assert.equal(res.created, true);
});

// A 403 from a repo whose Actions cannot create issues puts an error object where
// the issue should be; `createIssue` reads the STATUS, so this must not read as filed.
test('a refused create reports no issue number rather than a plausible one', async () => {
  const gh = fakeGh({ createStatus: 403 });
  const res = await reportWorkflowFailure(gh, REPO, { title: 'It broke', body: 'b' });
  assert.equal(res.issue, null);
});

test('the failure label set is ensured to spec and names the queue vocabulary', () => {
  assert.ok(FAILURE_LABELS.some((l) => l.name === WORKFLOW_FAILURE));
  for (const l of FAILURE_LABELS) assert.ok(l.color && l.description, `${l.name} is ensured to spec`);
});

test('the run url is null outside Actions rather than a url naming undefined', () => {
  assert.equal(runUrl({}), null);
  assert.equal(runUrl({ GITHUB_RUN_ID: '5', GITHUB_REPOSITORY: REPO, GITHUB_SERVER_URL: 'https://gh' }),
    `https://gh/${REPO}/actions/runs/5`);
});

// --- the executor continuation chain ---------------------------------------

// An absent or unparseable depth is the FIRST death, never a large number — which
// would silence the continuation exactly when the queue most needs it.
test('an absent, empty or junk depth reads as the first death', () => {
  for (const raw of [undefined, null, '', '   ', 'nope', '0', '-4']) {
    assert.equal(nextDepth(raw), 1, `${JSON.stringify(raw)} is depth 1`);
  }
  assert.equal(nextDepth('2'), 3);
  assert.equal(nextDepth(' 2 '), 3);
});

test('a death under the cap dispatches a fresh executor carrying the next depth', async () => {
  const gh = fakeGh();
  assert.deepEqual(await continueOrEscalate(gh, REPO, 'main', 1), { continued: 1 });
  const sent = gh.calls.find((c) => c.path.endsWith('/dispatches'));
  assert.match(sent.path, /claudinite-executor\.yml/);
  assert.deepEqual(sent.body, { ref: 'main', inputs: { continuation_depth: '1' } });
});

// Judged by STATUS: a token without `actions: write` 403s the POST with a
// plausible body, and a run that logged `ok` for it leaves the queue undrained.
test('a refused dispatch fails the job rather than reporting a continuation', async () => {
  const gh = fakeGh({ dispatchStatus: 403 });
  await assert.rejects(() => continueOrEscalate(gh, REPO, 'main', 1), /403/);
});

test('past the cap it escalates and fails, and dispatches nothing more', async () => {
  const gh = fakeGh();
  await assert.rejects(() => continueOrEscalate(gh, REPO, 'main', MAX_DEPTH + 1),
    new RegExp(`${MAX_DEPTH} times in a row`));
  assert.ok(!gh.calls.some((c) => c.path.endsWith('/dispatches')),
    'a chain that has died MAX_DEPTH times does not spend the day proving it');
  const filed = gh.calls.find((c) => c.path === `/repos/${REPO}/issues` && c.method === 'POST');
  assert.equal(filed.body.title, CHAIN_FAILURE_TITLE);
});

test('the last continuation still runs — the cap is inclusive', async () => {
  const gh = fakeGh();
  assert.deepEqual(await continueOrEscalate(gh, REPO, 'main', MAX_DEPTH), { continued: MAX_DEPTH });
});
