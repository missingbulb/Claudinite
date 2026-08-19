import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suspectedBody, convergeSuspectedIssue, renderFitSummary,
} from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/scan-for-needed-packs.mjs';
import { SUSPECTED_TITLE, LABEL } from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/protocol.mjs';

// The scan's network half is exercised through remote-context.test.mjs; what is
// tested here is what the scan SAYS (the member-side issue body, the run summary)
// and how it CONVERGES a member's suspected issue — the write surface of the
// fan-out model's scan half.

const finding = (repo, over = {}) => ({ repo, fits: ['node'], undecided: [], ...over });
const summary = (over) => renderFitSummary({
  owner: 'acme', home: 'acme/sheepdog', canonRepo: 'acme/Claudinite', packCount: 29,
  findings: [], fitted: [], dormant: [], outOfScope: [], unknown: [], actions: [], fired: [], ...over,
});

// --- the issue body -----------------------------------------------------------

test('suspectedBody: names each suspected pack and what it is for', () => {
  const packsById = new Map([['node', { id: 'node', ruleRoutingGuidance: { belongs: 'JavaScript/TypeScript projects' } }]]);
  const body = suspectedBody({ fits: ['node'], undecided: [], packsById });
  assert.match(body, /`node`/);
  assert.match(body, /JavaScript\/TypeScript projects/);
});

test('suspectedBody: says a fingerprint SUSPECTS rather than proves', () => {
  // The retired `pack-declaration` check was deleted precisely because declaring is
  // the project's call. An issue body that reads like a verdict re-introduces the
  // thing that was removed, one rung further out.
  const body = suspectedBody({ fits: ['node'], undecided: [] });
  assert.match(body, /suspects/);
  assert.match(body, /project's call/);
});

test('suspectedBody: routes the acting to the member\'s own adopt task and skill', () => {
  const body = suspectedBody({ fits: ['node'], undecided: [] });
  assert.match(body, /adopt-requested-packs/);
  assert.match(body, /adopt-pack/);
  assert.match(body, /not planned/);
});

test('suspectedBody: names the fingerprints it could NOT decide, with the reason', () => {
  // Silently dropping them would make the issue read as the complete answer, and the
  // member's agent — which CAN decide them from its checkout — would never look.
  const body = suspectedBody({
    fits: ['node'],
    undecided: [{ id: 'jwt', why: 'the fingerprint wanted 300 file reads (budget 24)' }],
  });
  assert.match(body, /Not decided from outside/);
  assert.match(body, /`jwt`/);
  assert.match(body, /300 file reads/);
  assert.match(body, /localFits/);
});

test('suspectedBody: is a pure function of its inputs — the same finding renders identically', () => {
  // The convergence rewrites the issue only when the body CHANGES, so any instability
  // here (a date, a set iteration order) would rewrite every issue every week.
  const args = { fits: ['firebase', 'node'], undecided: [{ id: 'jwt', why: 'x' }] };
  assert.equal(suspectedBody(args), suspectedBody(args));
});

// --- per-member convergence -----------------------------------------------------

// A scripted gh double: replays labeledIssues' underlying paged read, records writes.
function ghDouble({ open = [], closed = [] } = {}) {
  const writes = [];
  const gh = async (path, init) => {
    if (init) { writes.push({ path, ...init }); return { status: path.endsWith('/issues') || path.endsWith('/labels') ? 201 : 200, json: { number: 90 } }; }
    if (path.includes('/issues?')) {
      // labeledIssues pages state=all; one page is enough for a test double.
      const items = [...open.map((i) => ({ ...i, state: 'open' })), ...closed.map((i) => ({ ...i, state: 'closed' }))];
      return { status: 200, json: items };
    }
    return { status: 200, json: {} };
  };
  gh.writes = writes;
  return gh;
}

test('convergeSuspectedIssue: opens in the MEMBER, under the protocol label and title', async () => {
  const gh = ghDouble();
  const { action, openWork } = await convergeSuspectedIssue(gh, 'acme/app', { fits: ['node'], body: 'B' });
  assert.match(action, /opened #90 \(acme\/app\)/);
  assert.equal(openWork, true);
  const create = gh.writes.find((w) => w.path === '/repos/acme/app/issues');
  assert.equal(create.body.title, SUSPECTED_TITLE);
  assert.deepEqual(create.body.labels, [LABEL]);
});

test('convergeSuspectedIssue: rewrites a changed body, leaves an unchanged one alone', async () => {
  const existing = { number: 7, title: SUSPECTED_TITLE, body: 'OLD', labels: [{ name: LABEL }] };
  const changed = ghDouble({ open: [existing] });
  const r1 = await convergeSuspectedIssue(changed, 'acme/app', { fits: ['node'], body: 'NEW' });
  assert.match(r1.action, /updated #7/);
  assert.ok(changed.writes.some((w) => w.path === '/repos/acme/app/issues/7'));

  const same = ghDouble({ open: [{ ...existing, body: 'OLD' }] });
  const r2 = await convergeSuspectedIssue(same, 'acme/app', { fits: ['node'], body: 'OLD' });
  assert.equal(r2.action, null);
  assert.equal(r2.openWork, true);   // unchanged is still open work — the member may not have acted yet
  assert.equal(same.writes.length, 0);
});

test('convergeSuspectedIssue: closes completed once nothing is suspected any more', async () => {
  const gh = ghDouble({ open: [{ number: 7, title: SUSPECTED_TITLE, body: 'OLD', labels: [{ name: LABEL }] }] });
  const { action, openWork } = await convergeSuspectedIssue(gh, 'acme/app', { fits: [], body: '' });
  assert.match(action, /closed #7/);
  assert.equal(openWork, false);
  const patch = gh.writes.find((w) => w.path === '/repos/acme/app/issues/7');
  assert.equal(patch.body.state_reason, 'completed');
});

test('convergeSuspectedIssue: a not_planned close is a standing decline — never reopened', async () => {
  // An owner who closed the suspicion `not planned` has answered. Re-suggesting
  // weekly is nagging about a decision already made.
  const gh = ghDouble({
    closed: [{ number: 3, title: SUSPECTED_TITLE, state_reason: 'not_planned', closed_at: '2026-08-01T00:00:00Z', labels: [{ name: LABEL }] }],
  });
  const { action, openWork } = await convergeSuspectedIssue(gh, 'acme/app', { fits: ['node'], body: 'B' });
  assert.equal(action, null);
  assert.equal(openWork, false);
  assert.equal(gh.writes.length, 0);
});

// --- the run summary ----------------------------------------------------------

test('renderFitSummary: names members with fits AND the ones that came back clean', () => {
  // The full-roster property: a reader must be able to tell "fine" from "fell out of
  // the report", so `fitted` is named as loudly as the findings.
  const s = summary({
    findings: [finding('acme/app', { fits: ['node', 'firebase'] })],
    fitted: ['acme/site'], dormant: ['acme/old'], outOfScope: ['acme/fork (fork)'],
    fired: ['acme/app'],
  });
  assert.match(s, /acme\/app` → node, firebase/);
  assert.match(s, /\*\*Fitted:\*\* acme\/site/);
  assert.match(s, /acme\/old/);
  assert.match(s, /acme\/fork \(fork\)/);
  assert.match(s, /acme\/sheepdog — the enforcer itself/);
});

test('renderFitSummary: a fleet with nothing suspected still reports every repo', () => {
  const s = summary({ fitted: ['acme/site'] });
  assert.match(s, /\*\*Undeclared fits:\*\* none/);
  assert.match(s, /\*\*Fitted:\*\* acme\/site/);
  assert.match(s, /\*\*Issue actions:\*\* none \(converged\)/);
});

test('renderFitSummary: unknown repos are shouted, not folded into a state', () => {
  // `unknown` is never `fitted` — the worker also exits non-zero on it, so this line
  // is what tells the reader WHICH repo to go and fix the token for.
  const s = summary({ unknown: ['acme/private — .claudinite-checks.json returned 403'] });
  assert.match(s, /UNKNOWN/);
  assert.match(s, /acme\/private — .claudinite-checks\.json returned 403/);
});

test('renderFitSummary: a scoped scan says so before any count', () => {
  // Every count in a scoped run is a count of the named part, and "nothing
  // suspected" must not read as a statement about the fleet.
  const s = summary({ repoFilter: ['acme/a', 'acme/b'] });
  assert.match(s, /Scoped to \*\*2 named repo\(s\)\*\*: acme\/a, acme\/b/);
});

test('renderFitSummary: names the corpus it measured against, and how big it was', () => {
  // The silent failure this guards: the enforcer's own mount carries only the packs
  // IT declares, so fingerprinting the fleet against the mount would report every
  // member as fitted while testing almost nothing.
  const s = summary({ fitted: ['acme/site'] });
  assert.match(s, /29 canon pack\(s\)/);
  assert.match(s, /acme\/Claudinite/);
});
