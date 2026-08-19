import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unknownPacks, unansweredQuestions, entryFor, requestedBody, qualify,
  resolveTargets, convergeRequestedIssue, closeSatisfiedRequest, renderForceSummary,
} from '../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-add-missing-packs/force-add-packs.mjs';
import { LABEL, REQUESTED_TITLE, entriesIn } from '../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-add-missing-packs/protocol.mjs';

// The force half writes a DECISION into a member's work list — packs, config and
// interview answers a human typed, which the member's agent then copies into its
// declaration. Everything asserted here is either a refusal (the run must not
// proceed) or a fidelity property (what the operator typed is what the issue says).

const PACKS = [
  { id: 'plain', ruleRoutingGuidance: { belongs: 'nothing in particular' } },
  { id: 'asks', questions: [{ id: 'store', prompt: 'Where is the store?' }] },
];

// --- refusals -----------------------------------------------------------------

test('an unknown pack id is caught here, not in the member\'s declaration', () => {
  // An unknown id in a member's .claudinite-checks.json is a BLOCKING settings error
  // there: the repo stops running its own checks until a human edits the file.
  assert.deepEqual(unknownPacks(['plain', 'typo'], PACKS), ['typo']);
  assert.deepEqual(unknownPacks(['plain'], PACKS), []);
});

test('an unanswered interview question blocks the run', () => {
  // The owner's ruling and adopt-pack's unattended rule agree: an answer is the
  // owner's to give. A force that let one through would be the one path in the
  // system that writes a decision nobody made.
  const missing = unansweredQuestions(['asks'], PACKS, {});
  assert.equal(missing.length, 1);
  assert.equal(missing[0].pack, 'asks');
  assert.equal(missing[0].question, 'store');
  assert.match(missing[0].prompt, /Where is the store/);
});

test('an answer the owner gave passes — including "n/a"', () => {
  assert.deepEqual(unansweredQuestions(['asks'], PACKS, { asks: { store: 'n/a — none wanted' } }), []);
  // Blank is not an answer: it is the absence of one wearing the shape of one.
  assert.equal(unansweredQuestions(['asks'], PACKS, { asks: { store: '   ' } }).length, 1);
});

test('a pack that asks nothing needs no answers', () => {
  assert.deepEqual(unansweredQuestions(['plain'], PACKS, {}), []);
});

// --- resolving the named repos ------------------------------------------------

const declOf = (map) => async (path) => {
  const m = /\/repos\/([^/]+\/[^/]+)\/contents\//.exec(path);
  const name = m[1].toLowerCase();
  if (!(name in map)) return { status: 404, json: {} };
  return { status: 200, json: { content: Buffer.from(JSON.stringify(map[name])).toString('base64'), sha: 'x' } };
};

test('a bare name is qualified with the configured owner', () => {
  assert.equal(qualify('TLDR', 'acme'), 'acme/tldr');
  assert.equal(qualify('other/TLDR', 'acme'), 'other/tldr');
});

test('a repo that is not a member, or is dormant, or is foreign, fails the WHOLE run', () => {
  // All-or-nothing: three repos adopted and a fourth silently skipped is the state
  // hardest to see and hardest to undo.
  const gh = declOf({ 'acme/live': { packs: [] }, 'acme/sleepy': { packs: [], dormant: true } });
  return Promise.all([
    assert.rejects(
      () => resolveTargets(gh, { repos: ['live', 'ghost'], owner: 'acme', addPacks: ['plain'] }),
      /not a covered member/,
    ),
    assert.rejects(
      () => resolveTargets(gh, { repos: ['live', 'sleepy'], owner: 'acme', addPacks: ['plain'] }),
      /dormant/,
    ),
    assert.rejects(
      () => resolveTargets(gh, { repos: ['elsewhere/live'], owner: 'acme', addPacks: ['plain'] }),
      /not under the configured owner/,
    ),
  ]);
});

test('a repo that already declares the pack is reported, not re-adopted', async () => {
  const gh = declOf({
    'acme/has': { packs: ['plain'] },
    'acme/needs': { packs: [{ id: 'other' }] },
  });
  const reposByName = new Map([['acme/needs', { default_branch: 'trunk' }]]);
  const { targets, alreadyDeclared } = await resolveTargets(gh, { repos: ['has', 'needs'], owner: 'acme', addPacks: ['plain'], reposByName });
  assert.deepEqual(alreadyDeclared, ['acme/has']);
  assert.deepEqual(targets, [{ fullName: 'acme/needs', missing: ['plain'], defaultBranch: 'trunk' }]);
});

// --- what the issue says ------------------------------------------------------

test('the entry carries the config and the answers, and omits what was not given', () => {
  assert.deepEqual(entryFor('plain', {}), { id: 'plain' });
  assert.deepEqual(
    entryFor('asks', { packConfig: { asks: { repo: 'o/S' } }, packAnswers: { asks: { store: 'o/S — the store' } } }),
    { id: 'asks', config: { repo: 'o/S' }, answers: { store: 'o/S — the store' } },
  );
});

test('the body renders the entries as the JSON that will land in the file, and the protocol reads them back', () => {
  // Rendered rather than described: the operator's intent travels through a text box,
  // an issue and the member's agent, and this literal is the one place it can be
  // checked against what lands in the declaration. entriesIn is the member side's
  // reader, so the round-trip is the contract.
  const body = requestedBody({
    addPacks: ['asks'],
    packConfig: { asks: { repo: 'o/S' } },
    packAnswers: { asks: { store: 'o/S — the store' } },
    packsById: new Map(PACKS.map((p) => [p.id, p])),
    enforcer: 'acme/claudinite-fleet-sheepdog',
  });
  assert.match(body, /```json/);
  assert.match(body, /not a fingerprint's suspicion/i);
  assert.match(body, /adopt-requested-packs/);
  assert.deepEqual(entriesIn(body), [
    { id: 'asks', config: { repo: 'o/S' }, answers: { store: 'o/S — the store' } },
  ]);
});

test('the body is a pure function of its inputs — a converged issue is not rewritten', () => {
  const args = { addPacks: ['plain'], packConfig: {}, packAnswers: {} };
  assert.equal(requestedBody(args), requestedBody(args));
});

// --- converging the member's requested issue ------------------------------------

function ghDouble({ open = [], closed = [] } = {}) {
  const writes = [];
  const gh = async (path, init) => {
    if (init) { writes.push({ path, ...init }); return { status: path.endsWith('/issues') || path.endsWith('/labels') ? 201 : 200, json: { number: 41 } }; }
    if (path.includes('/issues?')) {
      const items = [...open.map((i) => ({ ...i, state: 'open' })), ...closed.map((i) => ({ ...i, state: 'closed' }))];
      return { status: 200, json: items };
    }
    return { status: 200, json: {} };
  };
  gh.writes = writes;
  return gh;
}

test('convergeRequestedIssue: opens in the MEMBER under the protocol label and title', async () => {
  const gh = ghDouble();
  const { action } = await convergeRequestedIssue(gh, 'acme/app', { body: 'B' });
  assert.match(action, /opened #41/);
  const create = gh.writes.find((w) => w.path === '/repos/acme/app/issues');
  assert.equal(create.body.title, REQUESTED_TITLE);
  assert.deepEqual(create.body.labels, [LABEL]);
});

test('convergeRequestedIssue: a repeated force rewrites the body; an identical one writes nothing', async () => {
  const existing = { number: 5, title: REQUESTED_TITLE, body: 'OLD', labels: [{ name: LABEL }] };
  const changed = ghDouble({ open: [existing] });
  const r1 = await convergeRequestedIssue(changed, 'acme/app', { body: 'NEW' });
  assert.match(r1.action, /updated #5/);

  const same = ghDouble({ open: [{ ...existing }] });
  const r2 = await convergeRequestedIssue(same, 'acme/app', { body: 'OLD' });
  assert.equal(r2.action, null);
  // The label-ensure POST is idempotent housekeeping; no ISSUE write may happen.
  assert.ok(!same.writes.some((w) => w.path.includes('/issues')));
});

// --- closing a satisfied request -------------------------------------------------

test('a requested issue closes only once the declaration carries everything it asked for', async () => {
  const body = requestedBody({ addPacks: ['plain', 'asks'], packConfig: {}, packAnswers: {} });
  const issue = { number: 7, title: REQUESTED_TITLE, body };
  const gh = ghDouble();

  assert.equal(await closeSatisfiedRequest(gh, 'acme/app', { decl: { packs: ['plain'] }, open: [issue] }), null);
  assert.equal(gh.writes.length, 0);

  const done = await closeSatisfiedRequest(gh, 'acme/app', { decl: { packs: ['plain', { id: 'asks' }] }, open: [issue] });
  assert.match(done, /closed #7/);
  const patch = gh.writes.find((w) => w.path === '/repos/acme/app/issues/7');
  assert.equal(patch.body.state_reason, 'completed');
});

test('an unreadable request body is left OPEN — "could not tell" never closes a request', async () => {
  const gh = ghDouble();
  const r = await closeSatisfiedRequest(gh, 'acme/app', {
    decl: { packs: ['plain'] },
    open: [{ number: 9, title: REQUESTED_TITLE, body: 'no json here' }],
  });
  assert.equal(r, null);
  assert.equal(gh.writes.length, 0);
});

// --- the report ---------------------------------------------------------------

test('the summary names every requested repo under exactly one state', () => {
  const s = renderForceSummary({
    owner: 'acme',
    addPacks: ['plain'],
    targets: [{ fullName: 'acme/needs', missing: ['plain'] }],
    alreadyDeclared: ['acme/has'],
    actions: ['opened #3 (acme/needs)'],
    fired: ['acme/needs'],
  });
  assert.match(s, /acme\/needs` → plain/);
  assert.match(s, /Already declaring \(untouched\):\*\* acme\/has/);
  assert.match(s, /opened #3/);
  // The standing promise of this half: it writes nothing to a member's tree.
  assert.match(s, /Nothing was written to any member/);
});
