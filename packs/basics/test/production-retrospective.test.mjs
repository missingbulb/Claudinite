// The production-retrospective skill (#1501) rides the same request lane as
// verify-in-production — the queue is the delayed-execution mechanism, so the
// skill's whole contract is prose. These pin the parts the machinery and the
// neighbouring skills depend on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../skills/production-retrospective/SKILL.md'), 'utf8');

// The discernment bar: a minor feature's proof is verify-in-production's point
// assertion; only an element that earned a design doc or a phased tracking issue
// files a retrospective. Without the bar every merge would grow one.
test('the skill carries the bar — most changes file no retrospective', () => {
  assert.match(skill, /design doc|tracking issue/i,
    'the skill never says what earns a retrospective, so every change would file one');
  assert.match(skill, /files? no\s+retrospective/i,
    'the skill never says which changes file nothing');
});

test('what it files is a request the queue adopts, not a mechanism beside it', () => {
  assert.match(skill, /`task:origin:ad-hoc`/, 'the mark is what makes the scheduler run adopt the issue');
  assert.match(skill, /Retry-every:/, 'without the extension a thin record cannot re-arm');
  assert.match(skill, /Model: opus/, 'an open review is judgment work, not a field read');
  assert.match(skill, /Never `Automerge:`/, 'a retrospective has nothing to merge');
});

// The horizon is measured from the SUBJECT's completion, read at run time — never
// from the filing moment. A chain files its retrospective at plan time, when the
// completion instant cannot be known.
test('the horizon runs from the subject completing, read by the run', () => {
  assert.match(skill, /completed|completion/i);
  assert.doesNotMatch(skill, /a week after filing/i,
    'a horizon measured from the filing moment reviews a record that has not formed');
});

// The hierarchy: the retrospective hangs under the element it reviews, the same
// link verify-in-production makes to its original issue.
test('the retrospective is filed as a sub-issue of its subject', () => {
  assert.match(skill, /sub-issue/i, 'the skill never links the retrospective under what it reviews');
});

// The brief is the four questions — the review's whole frame, and what a run
// answers with counts and links rather than impressions.
test('the brief asks the four questions', () => {
  for (const q of [/working/i, /misused/i, /overused/i, /underused/i]) {
    assert.match(skill, q, `the four-question brief is missing ${q}`);
  }
});

// A retrospective FILES its findings and fixes nothing: its output is issues, one
// per systemic fault, never a patch and never a reopened original — a finding here
// is new work, not a failed assertion.
test('findings become issues; the run fixes nothing and reopens nothing', () => {
  assert.match(skill, /one issue per/i, 'the skill never says where findings land');
  assert.match(skill, /fixes nothing/i);
  assert.doesNotMatch(skill, /reopen/i,
    'reopening is verify-in-production\'s failure route; a retrospective files new work');
});

// Findings route by KIND: an implementation that betrays the design is a bug —
// an actionable issue the queue can implement; a design decision the record
// disproves is the owner's call — a discussion issue that waits on their
// decision, never silently "fixed" by the run or the queue.
test('findings route by kind — implementation faults to task issues, design faults to the owner', () => {
  assert.match(skill, /implementation fault|does not do what the design/i);
  assert.match(skill, /discussion issue/i,
    'a disproven design decision has nowhere to land but a fix nobody authorized');
  assert.match(skill, /owner'?s? decision|blocked on the owner|waits on the owner/i,
    'nothing holds the design question for the person who owns it');
});

// The expected behaviour is derived from the design BEFORE the record is read —
// RULES.md's auditing-an-artifact-against-its-source discipline, applied here.
test('the review derives the expectation from the design first', () => {
  assert.match(skill, /before reading|before the record|design (doc )?first/i,
    'nothing stops the review rationalizing the record it just read');
});

// THE BRIEF IS DESIGNED WITH THE DESIGN (owner, 2026-08-31). What to retrospect
// on is answered while the element is being designed — expectations and their
// amounts, the behaviours, the signals, the metrics and how the run reaches
// them. Answered at run time it is too late twice over: the designer's intent
// is gone, and a number nobody recorded cannot be read back.
test('the brief is authored at design time, never at run time', () => {
  assert.match(skill, /at design time|with the design|being designed/i,
    'the skill never says when the brief is written, so it gets written when the run fires');
  assert.match(skill, /not when the retrospective runs|too late/i,
    'the skill never says why run-time authoring fails');
});

test('the brief states expectations with amounts, behaviours, and how each is measured', () => {
  assert.match(skill, /amounts?/i, 'an expectation without a quantity cannot be missed');
  assert.match(skill, /behaviou?rs?/i, 'the brief never asks how people will actually use it');
  assert.match(skill, /measur/i, 'an expectation nobody can measure is an impression');
});

test('the signals are named in advance — misuse, overuse, and a wrong design decision each', () => {
  assert.match(skill, /signal/i);
  assert.match(skill, /wrong.{0,30}decision/i,
    'the brief never asks what would show a design decision was wrong');
});

test('the brief marks which decisions are cheap to re-examine', () => {
  assert.match(skill, /re-?examin/i,
    'without naming the revisitable decisions the review can only confirm or condemn the whole design');
});

// A metric the run cannot reach makes the retrospective unverifiable — so the
// brief names each required metric and the implementation records it, the same
// discipline as RULES.md's writing-code-that-can-silently-do-nothing.
test('required metrics are named, and their access is built at implementation time', () => {
  assert.match(skill, /metric/i);
  assert.match(skill, /access|reach|read back/i,
    'the brief never asks how the run will get at the numbers it needs');
});

// A run that cannot make its reads parks rather than guessing — a scope-blocked
// read answers "all clean" exactly the way a healthy mechanism does.
test('an unreadable record parks, never passes', () => {
  assert.match(skill, /park/i);
});

// The lane is open by construction: a retrospective class is {trigger, subject,
// horizon, brief}, and canon packs, a repo's local packs and the fleet enforcer
// may each define their own.
test('the lane is extensible — canon, local and fleet classes are all named', () => {
  assert.match(skill, /canon pack/i);
  assert.match(skill, /local pack/i);
  assert.match(skill, /fleet/i);
  assert.match(skill, /trigger/i, 'a class without a trigger is a habit, not a mechanism');
});
