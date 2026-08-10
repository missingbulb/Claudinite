import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unknownPacks, unansweredQuestions, entryFor, forceBody, forceTitle, qualify,
  resolveTargets, packsRequestedIn, convergeForceClosures, renderForceSummary,
} from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/force-add-packs.mjs';

// The force half writes a DECISION into the fleet's work list — packs, config and
// interview answers a human typed, which an agent then copies into a member's
// declaration. Everything asserted here is either a refusal (the run must not proceed) or
// a fidelity property (what the operator typed is what the issue says).

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
  // The owner's ruling and adopt-pack's unattended rule agree: an answer is the owner's
  // to give. A force that let one through would be the one path in the system that
  // writes a decision nobody made.
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

test('a repo that is not a member, or is dormant, fails the WHOLE run', () => {
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
  const { targets, alreadyDeclared } = await resolveTargets(gh, { repos: ['has', 'needs'], owner: 'acme', addPacks: ['plain'] });
  assert.deepEqual(alreadyDeclared, ['acme/has']);
  assert.deepEqual(targets, [{ fullName: 'acme/needs', missing: ['plain'] }]);
});

// --- what the issue says ------------------------------------------------------

test('the entry carries the config and the answers, and omits what was not given', () => {
  assert.deepEqual(entryFor('plain', {}), { id: 'plain' });
  assert.deepEqual(
    entryFor('asks', { packConfig: { asks: { repo: 'o/S' } }, packAnswers: { asks: { store: 'o/S — the store' } } }),
    { id: 'asks', config: { repo: 'o/S' }, answers: { store: 'o/S — the store' } },
  );
});

test('the body renders the entry as the JSON that will land in the file', () => {
  // Rendered rather than described: the operator's intent travels through a text box, an
  // issue and an agent, and this literal is the one place it can be checked against what
  // lands in the declaration.
  const body = forceBody('acme/app', {
    addPacks: ['asks'],
    packConfig: { asks: { repo: 'o/S' } },
    packAnswers: { asks: { store: 'o/S — the store' } },
    packsById: new Map(PACKS.map((p) => [p.id, p])),
  });
  assert.match(body, /```json/);
  assert.match(body, /"id": "asks"/);
  assert.match(body, /"repo": "o\/S"/);
  assert.match(body, /"store": "o\/S — the store"/);
  assert.match(body, /not a fingerprint's suspicion/);
  assert.match(body, /adopt-pack/);
});

test('the body is a pure function of its inputs — a converged issue is not rewritten', () => {
  const args = { addPacks: ['plain'], packConfig: {}, packAnswers: {} };
  assert.equal(forceBody('acme/app', args), forceBody('acme/app', args));
});

test('the title distinguishes a request from a suspicion', () => {
  // The agent stage routes on it: a suspicion is confirmed before it is acted on, a
  // request never is.
  assert.equal(forceTitle('acme/app'), 'Add packs: acme/app');
});

// --- closing a forced work list -----------------------------------------------

test('the packs a forced issue asked for are read back out of its own body', () => {
  const body = forceBody('acme/app', { addPacks: ['plain', 'asks'], packConfig: {}, packAnswers: { asks: { store: 'x' } } });
  assert.deepEqual(packsRequestedIn(body), ['plain', 'asks']);
  // An unreadable body yields null, and the closer leaves such an issue OPEN: "I could
  // not tell" must never close a request the owner made.
  assert.equal(packsRequestedIn('no json block here'), null);
  assert.equal(packsRequestedIn('```json\n{oops\n```'), null);
});

test('a forced issue closes only once the member declares everything it asked for', async () => {
  const body = forceBody('acme/app', { addPacks: ['plain', 'asks'], packConfig: {}, packAnswers: {} });
  const calls = [];
  const ghFor = (packs) => async (path, init) => {
    if (init) { calls.push(`${init.method} ${path}`); return { status: 200, json: {} }; }
    return { status: 200, json: { content: Buffer.from(JSON.stringify({ packs })).toString('base64'), sha: 'x' } };
  };
  const open = new Map([[forceTitle('acme/app'), { number: 7, body }]]);

  assert.deepEqual(await convergeForceClosures(ghFor(['plain']), 'acme/sheepdog', { open }), []);
  assert.equal(calls.length, 0);

  const actions = await convergeForceClosures(ghFor(['plain', 'asks']), 'acme/sheepdog', { open });
  assert.equal(actions.length, 1);
  assert.match(actions[0], /closed #7/);
  assert.ok(calls.some((c) => c.startsWith('PATCH')));
});

test('a scanned issue is never closed by the force closer, and vice versa', async () => {
  // They share a label; they do not share a lifecycle. Closing a hand-made request
  // because a fingerprint no longer suspects it would retract a decision.
  const open = new Map([['Pack fit: acme/app may want packs it does not declare', { number: 9, body: 'x' }]]);
  assert.deepEqual(await convergeForceClosures(async () => ({ status: 200, json: {} }), 'acme/sheepdog', { open }), []);
});

// --- the report ---------------------------------------------------------------

test('the summary names every requested repo under exactly one state', () => {
  const s = renderForceSummary({
    owner: 'acme',
    addPacks: ['plain'],
    targets: [{ fullName: 'acme/needs', missing: ['plain'] }],
    alreadyDeclared: ['acme/has'],
    actions: ['opened #3 (acme/needs: forced plain)'],
  });
  assert.match(s, /acme\/needs` → plain/);
  assert.match(s, /Already declaring \(untouched\):\*\* acme\/has/);
  assert.match(s, /opened #3/);
  // The standing promise of this half: it writes nothing to a member.
  assert.match(s, /Nothing was written to any member/);
});
