// The coded production-validation task (#1530): declarative URL probes a code
// worker fetches and judges Action-side, where egress exists — the lane for the
// verifications an agentic session structurally cannot run (#1184, #1288 parked
// on exactly that). The grammar and the judgment are pure and tested here; the
// worker's I/O shell is driven over an injected fetch and a fake GitHub.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVerificationSpec, parseAssertion, parseRetryEvery, evaluateAssertion,
  compareDotted, runProbes, renderResult,
} from '../../tasks/verify-production/probes.mjs';
import { runVerification } from '../../tasks/verify-production/worker.mjs';
import declarationJson from '../../tasks/verify-production/task.json' with { type: 'json' };
import { validateTaskDeclaration } from '../../task-contract.mjs';
import { evaluatePrecondition } from '../../shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const declaration = normalizeTaskDeclaration(declarationJson);

// --- the declaration -----------------------------------------------------------

test('the declaration is a valid manual agentless code-work task', () => {
  assert.deepEqual(validateTaskDeclaration(declaration), []);
  assert.equal(declaration.id, 'verify-production');
  assert.equal(declaration.frequency, 'manual', 'items exist only because a verification was filed');
  assert.equal(declaration.agent_model, 'none', 'the whole point: no session, so no egress wall');
  assert.equal(declaration.expected_outcome, 'none', 'a verification has nothing to merge');
});

test('the precondition always runs — a filed verification is its own mandate', () => {
  assert.deepEqual(declaration.preconditions, ['none']);
  assert.equal(evaluatePrecondition({ decl: declaration }, {}, {}, { number: 1 }).run, true);
});

// --- the spec grammar ----------------------------------------------------------

const SPEC = [
  'Original-issue: #1286',
  'Task: claudinite-tasks/verify-production',
  'Live-probe: https://x.github.io/r/stamp.json :: json claudinite.packVersions.claudinite-dashboard >= 60821.3',
  'Verify-probe: https://x.github.io/r/config.json :: json mode == "fleet"',
  'Verify-probe: https://x.github.io/r/settings-read.mjs :: not matches /node:/',
  'Retry-every: 6 hours',
].join('\n');

test('a full spec parses: original issue, both probe classes, the retry cadence', () => {
  const spec = parseVerificationSpec(SPEC);
  assert.deepEqual(spec.problems, []);
  assert.equal(spec.originalIssue, 1286);
  assert.equal(spec.retryEveryMs, 6 * 3600 * 1000);
  assert.equal(spec.live.length, 1);
  assert.equal(spec.verify.length, 2);
  assert.equal(spec.live[0].url, 'https://x.github.io/r/stamp.json');
  assert.equal(spec.live[0].assertion.op, 'json-gte');
  assert.equal(spec.verify[0].assertion.op, 'json-eq');
  assert.equal(spec.verify[1].assertion.negate, true);
});

// Absences are PROBLEMS, never defaults: a verification with no liveness gate
// cannot tell "not deployed yet" from "deployed and broken", so a verify failure
// would reopen the original issue over a release that simply has not happened.
test('a spec missing a required field names each gap as a problem', () => {
  const missing = (line) => parseVerificationSpec(
    SPEC.split('\n').filter((l) => !l.startsWith(line)).join('\n')).problems;
  assert.ok(missing('Live-probe:').some((p) => /Live-probe/.test(p)));
  assert.ok(missing('Verify-probe:').some((p) => /Verify-probe/.test(p)));
  assert.ok(missing('Original-issue:').some((p) => /Original-issue/.test(p)));
  assert.ok(missing('Retry-every:').some((p) => /Retry-every/.test(p)));
});

test('an unreadable probe line is a problem naming that line, never silently dropped', () => {
  const spec = parseVerificationSpec(`${SPEC}\nVerify-probe: https://x.example/y :: frobnicates nicely`);
  assert.ok(spec.problems.some((p) => p.includes('frobnicates')));
});

test('a probe URL must be http(s) — anything else is a problem, not a fetch attempt', () => {
  const spec = parseVerificationSpec(SPEC.replace('https://x.github.io/r/config.json', 'file:///etc/passwd'));
  assert.ok(spec.problems.some((p) => p.includes('file:///etc/passwd')));
});

test('Retry-every reads a count and a unit, and nothing else', () => {
  assert.equal(parseRetryEvery('6 hours'), 6 * 3600 * 1000);
  assert.equal(parseRetryEvery('1 day'), 24 * 3600 * 1000);
  assert.equal(parseRetryEvery('30 minutes'), 30 * 60 * 1000);
  assert.equal(parseRetryEvery('soonish'), null);
  assert.equal(parseRetryEvery(''), null);
});

// --- assertions ----------------------------------------------------------------

const ok200 = (body) => ({ status: 200, body });

test('status asserts the response code itself, and is the one op a non-2xx can pass', () => {
  assert.equal(evaluateAssertion(parseAssertion('status 200'), ok200('x')).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('status 404'), { status: 404, body: '' }).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('status 200'), { status: 500, body: '' }).ok, false);
});

test('body ops fail on a non-2xx response, carrying the HTTP status as the observation', () => {
  const r = evaluateAssertion(parseAssertion('contains ready'), { status: 503, body: 'ready' });
  assert.equal(r.ok, false);
  assert.match(r.observed, /503/);
});

test('contains and matches, each with its not form', () => {
  assert.equal(evaluateAssertion(parseAssertion('contains "mode": "fleet"'), ok200('{"mode": "fleet"}')).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('not contains node:'), ok200('import x from "./y.mjs"')).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('not contains node:'), ok200('import fs from "node:fs"')).ok, false);
  assert.equal(evaluateAssertion(parseAssertion('matches /^import\\b/'), ok200('import x')).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('not matches /node:/'), ok200('import "node:fs"')).ok, false);
});

test('json ops navigate a dotted path and judge the value actually there', () => {
  const body = '{"claudinite":{"packVersions":{"claudinite-dashboard":"60821.3"}},"mode":"fleet","n":3}';
  assert.equal(evaluateAssertion(parseAssertion('json mode == "fleet"'), ok200(body)).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('json mode == "repo"'), ok200(body)).ok, false);
  assert.equal(evaluateAssertion(parseAssertion('json n == 3'), ok200(body)).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('json mode exists'), ok200(body)).ok, true);
  assert.equal(evaluateAssertion(parseAssertion('json nope exists'), ok200(body)).ok, false);
  assert.equal(evaluateAssertion(parseAssertion('json mode != "repo"'), ok200(body)).ok, true);
  assert.equal(
    evaluateAssertion(parseAssertion('json claudinite.packVersions.claudinite-dashboard >= 60821.3'), ok200(body)).ok,
    true);
  const observed = evaluateAssertion(parseAssertion('json mode == "repo"'), ok200(body)).observed;
  assert.match(observed, /"fleet"/, 'the observation carries the value actually read');
});

test('a json op over a body that is not JSON fails with that as the observation', () => {
  const r = evaluateAssertion(parseAssertion('json mode exists'), ok200('<html>'));
  assert.equal(r.ok, false);
  assert.match(r.observed, /not JSON/i);
});

// Dotted versions are STRINGS compared segment-wise numeric — '60821.10' is ten
// past '60821.3', where a string compare calls it earlier and a float collapses
// it onto '60821.1'.
test('>= compares dotted identifiers segment-wise numeric, never as floats or strings', () => {
  assert.equal(compareDotted('60821.3', '60821.3'), 0);
  assert.equal(compareDotted('60820.2', '60821.3') < 0, true);
  assert.equal(compareDotted('60821.10', '60821.3') > 0, true);
  assert.equal(compareDotted('60821', '60821.3') < 0, true);
});

// --- running probes ------------------------------------------------------------

test('runProbes fetches each URL once, however many probes read it', async () => {
  const fetched = [];
  const fetchUrl = async (url) => { fetched.push(url); return ok200('{"mode":"fleet"}'); };
  const { verify } = parseVerificationSpec(SPEC.replace(
    'Verify-probe: https://x.github.io/r/settings-read.mjs :: not matches /node:/',
    'Verify-probe: https://x.github.io/r/config.json :: contains fleet'));
  const results = await runProbes(verify, fetchUrl);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.ok));
  assert.deepEqual(fetched, ['https://x.github.io/r/config.json']);
});

test('a fetch that could not be made fails the probe with the error as the observation', async () => {
  const fetchUrl = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  const [r] = await runProbes(parseVerificationSpec(SPEC).live, fetchUrl);
  assert.equal(r.ok, false);
  assert.match(r.observed, /ENOTFOUND/);
});

test('a rendered result carries verdict, URL, assertion and observation', () => {
  const [probe] = parseVerificationSpec(SPEC).verify;
  assert.match(renderResult({ probe, ok: false, observed: 'read "repo"' }),
    /^FAIL — https:\/\/x\.github\.io\/r\/config\.json :: json mode == "fleet" — read "repo"$/);
});

// --- the worker's verdict flow -------------------------------------------------

// A fake gh + issue store, shaped like the janitor tests' fakes: just enough REST.
function fakeIssues(issues) {
  const calls = [];
  const find = (n) => issues.find((i) => i.number === n);
  const gh = async (path, { method = 'GET', body } = {}) => {
    calls.push(`${method} ${path}`);
    const m = /^\/repos\/o\/r\/issues\/(\d+)(\/comments)?$/.exec(path);
    if (!m) return { status: 404, json: null };
    const issue = find(Number(m[1]));
    if (!issue) return { status: 404, json: null };
    if (m[2] && method === 'POST') { issue.comments.push(body.body); return { status: 201, json: {} }; }
    if (method === 'PATCH') { Object.assign(issue, body); return { status: 200, json: issue }; }
    return { status: 200, json: issue };
  };
  return { gh, calls, find };
}

const item = (body) => ({ number: 9, state: 'open', body, comments: [] });
const original = () => ({ number: 1286, state: 'closed', body: 'the change', comments: [] });

const LIVE_URL = 'https://x.github.io/r/stamp.json';
const VERIFY_URL = 'https://x.github.io/r/config.json';
const BODY = [
  'Verify that the mode is stamped.',
  '',
  'Original-issue: #1286',
  `Live-probe: ${LIVE_URL} :: status 200`,
  `Verify-probe: ${VERIFY_URL} :: json mode == "fleet"`,
  'Retry-every: 6 hours',
].join('\n');

const drive = async (responses, body = BODY) => {
  const repo = fakeIssues([item(body), original()]);
  const verdict = await runVerification({
    gh: repo.gh, repo: 'o/r', itemNumber: 9,
    fetchUrl: async (url) => {
      if (!(url in responses)) throw new Error(`unexpected fetch of ${url}`);
      return responses[url];
    },
    now: () => new Date('2026-08-31T12:00:00Z'), log: () => {},
  });
  return { repo, verdict };
};

test('liveness failing → not-live, with the wake computed from now + Retry-every', async () => {
  const { repo, verdict } = await drive({ [LIVE_URL]: { status: 404, body: '' } });
  assert.equal(verdict.outcome, 'not-live');
  assert.equal(verdict.until, '2026-08-31T18:00:00.000Z');
  assert.match(verdict.reason, /not yet live/);
  assert.equal(repo.find(1286).state, 'closed', 'a release that has not happened reopens nothing');
});

test('live and all verify probes passing → pass, evidence commented on the item', async () => {
  const { repo, verdict } = await drive({
    [LIVE_URL]: { status: 200, body: 'ok' },
    [VERIFY_URL]: { status: 200, body: '{"mode":"fleet"}' },
  });
  assert.equal(verdict.outcome, 'pass');
  const comment = repo.find(9).comments.at(-1);
  assert.match(comment, /PASS — https:\/\/x\.github\.io\/r\/config\.json/, 'the evidence names what was read');
  assert.equal(repo.find(1286).state, 'closed');
});

test('live but a verify probe failing → fail: the original issue reopens with the evidence', async () => {
  const { repo, verdict } = await drive({
    [LIVE_URL]: { status: 200, body: 'ok' },
    [VERIFY_URL]: { status: 200, body: '{"mode":"repo"}' },
  });
  assert.equal(verdict.outcome, 'fail');
  assert.equal(repo.find(1286).state, 'open', 'the fault is the original issue\'s now');
  assert.match(repo.find(1286).comments.at(-1), /FAIL — /, 'what was asserted and what was read');
  assert.match(repo.find(9).comments.at(-1), /#1286/, 'the item links where the fault went');
});

test('an unreadable spec → invalid, naming every problem', async () => {
  const { verdict } = await drive({}, 'no probes here at all');
  assert.equal(verdict.outcome, 'invalid');
  assert.ok(verdict.problems.length >= 3);
});
