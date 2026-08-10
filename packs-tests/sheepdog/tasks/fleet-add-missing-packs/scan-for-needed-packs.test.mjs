import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitBody, renderFitSummary } from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/scan-for-needed-packs.mjs';

// The sweep's network half is exercised through remote-context.test.mjs; what is
// tested here is what the sweep SAYS — the issue body (which is also the agent
// stage's work list) and the run summary (which carries the full-roster property
// every sheepdog sweep is held to).

const finding = (repo, over = {}) => ({ repo, fits: ['node'], undecided: [], ...over });
const summary = (over) => renderFitSummary({
  owner: 'acme', home: 'acme/sheepdog', canonRepo: 'acme/Claudinite', packCount: 29,
  findings: [], fitted: [], dormant: [], outOfScope: [], unknown: [], actions: [], ...over,
});

// --- the issue body -----------------------------------------------------------

test('fitBody: names each suspected pack and what it is for', () => {
  const packsById = new Map([['node', { id: 'node', ruleRoutingGuidance: { belongs: 'JavaScript/TypeScript projects' } }]]);
  const body = fitBody('o/r', { fits: ['node'], undecided: [], packsById });
  assert.match(body, /`node`/);
  assert.match(body, /JavaScript\/TypeScript projects/);
});

test('fitBody: says a fingerprint SUSPECTS rather than proves', () => {
  // The retired `pack-declaration` check was deleted precisely because declaring is
  // the project's call. An issue body that reads like a verdict re-introduces the
  // thing that was removed, one rung further out.
  const body = fitBody('o/r', { fits: ['node'], undecided: [] });
  assert.match(body, /suspects/);
  assert.match(body, /project's call/);
});

test('fitBody: points at adopt-pack for the how', () => {
  assert.match(fitBody('o/r', { fits: ['node'], undecided: [] }), /adopt-pack/);
});

test('fitBody: names the fingerprints it could NOT decide, with the reason', () => {
  // Silently dropping them would make the issue read as the complete answer, and the
  // agent stage — which CAN decide them from a checkout — would never look.
  const body = fitBody('o/r', {
    fits: ['node'],
    undecided: [{ id: 'jwt', why: 'the fingerprint wanted 300 file reads (budget 24)' }],
  });
  assert.match(body, /Not decided from outside/);
  assert.match(body, /`jwt`/);
  assert.match(body, /300 file reads/);
  assert.match(body, /localFits/);
});

test('fitBody: no undecided section when everything was decidable', () => {
  assert.ok(!fitBody('o/r', { fits: ['node'], undecided: [] }).includes('Not decided from outside'));
});

test('fitBody: is a pure function of its inputs — the same finding renders identically', () => {
  // The convergence rewrites the issue only when the body CHANGES, so any instability
  // here (a date, a set iteration order) would rewrite every issue every week.
  const args = { fits: ['firebase', 'node'], undecided: [{ id: 'jwt', why: 'x' }] };
  assert.equal(fitBody('o/r', args), fitBody('o/r', args));
});

// --- the run summary ----------------------------------------------------------

test('renderFitSummary: names members with fits AND the ones that came back clean', () => {
  // The full-roster property: a reader must be able to tell "fine" from "fell out of
  // the report", so `fitted` is named as loudly as the findings.
  const s = summary({
    findings: [finding('acme/app', { fits: ['node', 'firebase'] })],
    fitted: ['acme/site'], dormant: ['acme/old'], outOfScope: ['acme/fork (fork)'],
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
  // `unknown` is never `fitted` — the sweep also exits non-zero on it, so this line
  // is what tells the reader WHICH repo to go and fix the token for.
  const s = summary({ unknown: ['acme/private — .claudinite-checks.json returned 403'] });
  assert.match(s, /UNKNOWN/);
  assert.match(s, /acme\/private — .claudinite-checks\.json returned 403/);
});

test('renderFitSummary: the undecided count rides the summary, aggregated across the fleet', () => {
  const s = summary({
    findings: [
      finding('acme/a', { undecided: [{ id: 'jwt', why: 'x' }, { id: 'leaflet', why: 'y' }] }),
      finding('acme/b', { undecided: [{ id: 'jwt', why: 'x' }] }),
    ],
  });
  assert.match(s, /Undecided fingerprints .*\*\* 3 across the fleet/);
});

test('renderFitSummary: names the corpus it measured against, and how big it was', () => {
  // The silent failure this guards: the enforcer's own mount carries only the packs
  // IT declares (four, for a sheepdog repo), so fingerprinting the fleet against the
  // mount would report every member as fitted while testing almost nothing. The
  // denominator in the report is what makes a shrunken corpus visible.
  const s = summary({ fitted: ['acme/site'] });
  assert.match(s, /29 canon pack\(s\)/);
  assert.match(s, /acme\/Claudinite/);
});
