// A check declares what happens when it fails as `on_fail: "block" | "advise"`,
// and a project overrides it per rule with "off" | "advise" | "block". The
// spellings the field replaced — `severity: "blocking" | "advisory"` on a rule or
// a declaration, and "blocking" | "advisory" as an override value — are still
// read, because a member's own local packs and settings carry them until the
// member acts on the `legacy-shape-in-use` advisory, and because the engine and
// the packs reach a member on separate cycles.

import test from 'node:test';
import assert from 'node:assert/strict';

import { finding, applyGrace, applyConfig, render, onFailOf } from '../engine/checks/helpers/findings.mjs';
import { reportFindings } from '../engine/checks/report-findings.mjs';
import { patternRule } from '../engine/checks/helpers/pattern-rules.mjs';

const emptyConfig = { rules: {}, accept: [] };
const hit = { file: 'a.mjs', what: 'it happened', fix: 'stop it' };

// A member's own tests may still read `finding.severity`, so a finding mirrors its
// on_fail in the old spelling for as long as the old spelling is read at all.
test('a per-finding on_fail overrides the rule\'s, and the old field mirrors it', () => {
  const f = finding({ id: 'acme-check', on_fail: 'block' }, { ...hit, on_fail: 'advise' });
  assert.equal(f.on_fail, 'advise');
  assert.equal(f.severity, 'advisory');
});

test('a rule still spelling severity yields the on_fail it meant', () => {
  assert.equal(finding({ id: 'acme-check', severity: 'blocking' }, hit).on_fail, 'block');
  assert.equal(finding({ id: 'acme-check', severity: 'advisory' }, hit).on_fail, 'advise');
  assert.equal(finding({ id: 'acme-check', on_fail: 'block' }, { ...hit, severity: 'advisory' }).on_fail, 'advise');
  assert.equal(onFailOf({ on_fail: 'advise', severity: 'blocking' }), 'advise', 'the current spelling wins');
  assert.equal(onFailOf({}), undefined, 'neither spelling is unknown, not a default');
});

test('a finding built by hand with the old field is read the same way through the pipeline', () => {
  const legacy = { rule: 'acme-check', severity: 'blocking', file: 'a.mjs', line: null, what: 'x', fix: 'y' };
  const [out] = applyConfig(applyGrace([legacy]), emptyConfig);
  assert.equal(out.on_fail, 'block');
  const [demoted] = applyConfig([legacy], { rules: { 'acme-check': 'advise' }, accept: [] });
  assert.equal(demoted.severity, 'advisory', 'the mirror follows an override');
});

test('the grace window turns block into advise', () => {
  const f = finding({ id: 'acme-check', on_fail: 'block', since: '2026-09-20' }, hit);
  const [inside] = applyGrace([f], { now: new Date('2026-09-25T00:00:00Z') });
  assert.deepEqual([inside.on_fail, inside.severity], ['advise', 'advisory']);
  assert.equal(applyGrace([f], { now: new Date('2026-10-20T00:00:00Z') })[0].on_fail, 'block');
});

test('a settings override takes the new values and still reads the old ones', () => {
  const f = finding({ id: 'acme-check', on_fail: 'block' }, hit);
  const g = finding({ id: 'acme-check', on_fail: 'advise' }, hit);
  const by = (value, x) => applyConfig([x], { rules: { 'acme-check': value }, accept: [] })[0].on_fail;
  assert.equal(by('advise', f), 'advise');
  assert.equal(by('block', g), 'block');
  assert.equal(by('advisory', f), 'advise');
  assert.equal(by('blocking', g), 'block');
  assert.equal(by('sometimes', f), 'block', 'an unknown value changes nothing');
});

test('a reasonless acceptance blocks', () => {
  const f = finding({ id: 'acme-check', on_fail: 'advise' }, hit);
  const out = applyConfig([f], { rules: {}, accept: [{ rule: 'acme-check' }] });
  assert.equal(out.find((x) => x.rule === 'config').on_fail, 'block');
});

test('the report keeps saying blocking and advisory, and counts on on_fail', () => {
  assert.match(render(finding({ id: 'acme-check', on_fail: 'block' }, hit)), /^\[BLOCKING\] acme-check/);
  assert.match(render(finding({ id: 'acme-check', on_fail: 'advise' }, hit)), /^\[ADVISORY\] acme-check/);
  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(s);
  let blocking;
  try {
    blocking = reportFindings([
      finding({ id: 'acme-check', on_fail: 'advise' }, hit),
      finding({ id: 'acme-check', on_fail: 'block' }, hit),
    ], emptyConfig, { scopeLabel: 'world', mode: 'full' });
  } finally { console.log = log; }
  assert.equal(blocking, 1);
  assert.match(lines[0], /^\[BLOCKING\]/, 'blocking findings print first');
  assert.equal(lines.at(-1), '1 blocking, 1 advisory (world scope: full).');
});

test('a declared check takes on_fail, and still reads severity', () => {
  const base = { failureMessage: 'm', fix: 'f', scanFiles: '^a$', matchLines: 'x' };
  assert.equal(patternRule({ id: 'acme-check-a', on_fail: 'advise', ...base }).on_fail, 'advise');
  assert.equal(patternRule({ id: 'acme-check-b', severity: 'blocking', ...base }).on_fail, 'block');
  assert.throws(() => patternRule({ id: 'acme-check-c', on_fail: 'blocking', ...base }), /on_fail must be "block" or "advise"/);
  assert.throws(() => patternRule({ id: 'acme-check-d', ...base }), /on_fail must be "block" or "advise"/);
});
