import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import rule from '../../worldRules/task-declaration-shape.mjs';
import { runRule } from '../../../../engine/checks/helpers/work.mjs';

const good = {
  id: 'acme-task-h',
  description: 'Mines the window for durable lessons and folds them into the local packs.',
  trigger: 'schedule',
  agent_model: 'opus',
  expected_outcome: 'fresh_pr',
  automerge: 'anything',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  preconditions: ['schedule:at-most-daily', 'substantive-change'],
};
const json = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const goodTask = json(good);
const TASK = '.claudinite/local/packs/mypack/tasks/acme-task-h/task.json';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return runRule(rule, buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};
const whatsOf = (files) => run(files).map((f) => f.what).join(' | ');

test('task-declaration-shape: a well-formed task.json yields no findings', () => {
  assert.deepEqual(run({ [TASK]: goodTask }), []);
});

test('task-declaration-shape: is inert when no task declaration exists', () => {
  assert.deepEqual(run({ 'src/app.js': 'x\n' }), []);
});

// THE DEFAULTS: automerge is nothing, agent_model is none — so a declaration
// carrying neither is a clean agentless task once it names its code work and when
// it runs, and the two timeouts are never defaulted.
test('task-declaration-shape: the minimal declaration is a code-work task, and needs its timeout', () => {
  const minimal = { id: 'acme-task-h', description: 'A minimal task.', trigger: 'schedule', preconditions: ['schedule:at-most-daily'], expected_outcome: 'fresh_pr', code_work: 'node worker.mjs', code_work_timeout: 60 };
  assert.deepEqual(run({ [TASK]: json(minimal) }), []);
  const { code_work_timeout, ...noBound } = minimal;
  assert.match(whatsOf({ [TASK]: json(noBound) }), /no numeric "code_work_timeout"/);
  const { code_work, ...nothing } = noBound;
  assert.match(whatsOf({ [TASK]: json(nothing) }), /declares no work step/);
});

// The second form of the same field, at the author-time surface. This check reads the
// declaration as TEXT while the runtime contract reads it parsed, so each form has to
// be taught here too: a check watching one of two identical surfaces reads as
// strictness on the other.
test('task-declaration-shape: code_worker_mjs is a work step, and is checked like one', () => {
  const wrapped = {
    id: 'acme-task-h',
    description: 'A minimal wrapped task.',
    trigger: 'schedule',
    preconditions: ['schedule:at-most-daily'],
    expected_outcome: 'fresh_pr',
    code_worker_mjs: 'worker.mjs',
    code_work_timeout: 60,
  };
  assert.deepEqual(run({ [TASK]: json(wrapped) }), []);
  const { code_work_timeout, ...noBound } = wrapped;
  assert.match(whatsOf({ [TASK]: json(noBound) }), /no numeric "code_work_timeout"/);
  assert.match(whatsOf({ [TASK]: json({ ...wrapped, code_worker_mjs: 'node worker.mjs' }) }), /is a command rather than a file name/);
  assert.match(whatsOf({ [TASK]: json({ ...wrapped, code_worker_mjs: 'worker.js' }) }), /does not name a \.mjs module/);
  assert.match(whatsOf({ [TASK]: json({ ...wrapped, code_worker_mjs: '../evil.mjs' }) }), /reaches outside the task directory/);
  assert.match(whatsOf({ [TASK]: json({ ...wrapped, code_work: 'node worker.mjs' }) }), /both "code_work" and "code_worker_mjs" are declared/);
});

test('task-declaration-shape: an agent carries its own worker file and bound — neither defaults', () => {
  const { agent_instructions, ...noWorker } = good;
  assert.match(whatsOf({ [TASK]: json(noWorker) }), /declares no string "agent_instructions"/);
  const { agent_execution_timeout, ...noBound } = good;
  assert.match(whatsOf({ [TASK]: json(noBound) }), /no numeric "agent_execution_timeout"/);
  assert.match(whatsOf({ [TASK]: json({ ...good, agent_model: 'gpt' }) }), /"agent_model" is "gpt", not a legal value/);
});

test('task-declaration-shape: a missing description is an advisory, a bad one blocks', () => {
  const { description, ...none } = good;
  const f = run({ [TASK]: json(none) });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'advisory');
  assert.match(f[0].what, /declares no "description"/);
  const long = run({ [TASK]: json({ ...good, description: Array.from({ length: 51 }, () => 'word').join(' ') }) });
  assert.equal(long.length, 1);
  assert.equal(long[0].severity, 'blocking');
  assert.match(long[0].what, /"description" runs to 51 words/);
  assert.match(whatsOf({ [TASK]: json({ ...good, description: '' }) }), /"description" is empty/);
});

test('task-declaration-shape: a file that is not a JSON object is flagged', () => {
  assert.match(whatsOf({ [TASK]: '{ "id": \n' }), /is not a JSON object/);
  assert.match(whatsOf({ [TASK]: '[1, 2]\n' }), /is not a JSON object/);
});

test('task-declaration-shape: flags illegal enum values', () => {
  const whats = whatsOf({ [TASK]: json({ ...good, preconditions: ['schedule:at-most-nightly'], agent_model: 'gpt', expected_outcome: 'push' }) });
  assert.match(whats, /"schedule" takes one of at-most-daily, at-most-weekly, at-most-monthly, not "at-most-nightly"/);
  assert.match(whats, /"agent_model" is "gpt", not a legal value/);
  assert.match(whats, /"expected_outcome" is "push", not a legal value/);
});

// The retired cadence field (docs/PRINCIPLES.md). ADVISORY, like every rename here: the
// runtime reads the field as the cadence term it meant, a member's task file is its own data,
// and the nightly acme-task-c rewrites it — so this finding names the edit and its CI stays green.
test('task-declaration-shape: the retired frequency field blocks, naming the cadence term to write', () => {
  const { preconditions, ...bare } = good;
  for (const [field, term] of [['daily', 'schedule:at-most-daily'], ['weekly', 'schedule:at-most-weekly'], ['monthly', 'schedule:at-most-monthly'], ['manual', null]]) {
    const findings = run({ [TASK]: json({ ...bare, frequency: field, preconditions: [term ?? 'substantive-change'] }) });
    assert.equal(findings.length, 1, `${field}: the field is the one finding`);
    assert.equal(findings[0].severity, 'blocking');
    assert.match(findings[0].what, /"frequency", which is retired/);
    // `manual` meant no schedule at all, which a declaration now says outright.
    assert.match(findings[0].fix, term === null ? /"trigger": "request"/ : new RegExp(`\\["${term}", …\\]`));
  }
  // A value the field never accepted is the same rejection — it is retired whatever it holds —
  // and the remedy falls back to the vocabulary rather than naming a term nothing accepts.
  const hourly = run({ [TASK]: json({ ...bare, frequency: 'hourly', preconditions: ['schedule:at-most-daily'] }) });
  assert.equal(hourly.length, 1);
  assert.match(hourly[0].fix, /schedule:at-most-<daily\|weekly\|monthly>/);
  // The expression beside it is still the author's, judged term by term and never widened.
  const withTerm = run({ [TASK]: json({ ...bare, frequency: 'daily', preconditions: ['schedule:at-most-daily', 'no-such-thing'] }) });
  assert.match(withTerm.map((f) => f.what).join(' | '), /unknown condition "no-such-thing"/);
});

// The field and ceiling renames came out on #1642's window. A declaration still
// on one of them now BLOCKS — as an unknown key the schema forbids, or as a
// ceiling that is not a legal value — rather than earning an advisory nudge.
test('task-declaration-shape: a retired outcome ceiling is no longer a rename, it is illegal', () => {
  for (const retired of ['open-pr', 'merged-pr', 'none', 'pr']) {
    const { automerge, ...rest } = good;
    const f = run({ [TASK]: json({ ...rest, expected_outcome: retired }) });
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].severity, 'blocking', `${retired} blocks`);
    assert.match(f[0].what, new RegExp(`"expected_outcome" is "${retired}", not a legal value`));
  }
  for (const outcome of ['amend_existing_or_create_new_pr', 'supersede_existing_pr']) {
    assert.deepEqual(run({ [TASK]: json({ ...good, expected_outcome: outcome }) }), [], outcome);
  }
});

// The retired field names have no reader left, so the check has nothing to say
// about them: what it reports is what the declaration is now MISSING.
test('task-declaration-shape: a retired code-work field name declares no code_work', () => {
  const { code_work, code_work_timeout, ...rest } = noneTask;
  for (const [field, timeout] of [['agent_preprocessing', 'agent_preprocessing_timeout'], ['prework', 'prework_timeout']]) {
    const whats = whatsOf({ [TASK]: json({ ...rest, [field]: 'node worker.mjs', [timeout]: 120 }) });
    assert.match(whats, /declares no work step/, field);
  }
  // The other two renames simply go unread — nothing here is wrong with the file.
  assert.deepEqual(run({ [TASK]: json({ ...good, after: ['acme-pack-b/acme-task-c'] }) }), []);
  assert.deepEqual(run({ [TASK]: json({ ...good, required_secrets: ['X'] }) }), []);
  assert.deepEqual(run({ [TASK]: json({ ...good, code_work_required_secrets: ['X'] }) }), []);
});

const noneTask = {
  id: 'acme-task-h', description: 'An agentless task.', trigger: 'schedule', preconditions: ['schedule:at-most-daily'], agent_model: 'none', expected_outcome: 'no_code_changes',
  code_work: 'node w.mjs', code_work_timeout: 60,
};

test('task-declaration-shape: a pr task without automerge lands nothing, and a none task with one blocks', () => {
  const { automerge, ...missing } = good;
  assert.deepEqual(run({ [TASK]: json(missing) }), []);
  assert.match(whatsOf({ [TASK]: json({ ...noneTask, automerge: 'anything' }) }), /a "no_code_changes" task declares "automerge"/);
});

test('task-declaration-shape: the canonical `schedule_after` is clean', () => {
  assert.deepEqual(run({ [TASK]: json({ ...good, schedule_after: ['acme-pack-b/acme-task-c'] }) }), [],
    'the canonical spelling must not match the legacy pattern on its own tail');
});

test('task-declaration-shape: flags missing required fields', () => {
  const whats = whatsOf({ [TASK]: json({ agent_model: 'none', code_work: 'node w.mjs', code_work_timeout: 5 }) });
  assert.match(whats, /declares no string "id"/);
  assert.doesNotMatch(whats, /"preconditions"/, 'no expression is a task off the schedule, not a missing field');
  assert.match(whats, /declares no "expected_outcome"/);
  // `none` is a second spelling of that absence, which is what retires it; it blocks by name.
  assert.match(whatsOf({ [TASK]: json({ ...good, preconditions: ['none'] }) }), /"none" is retired/);
});

// --- the declarative expression, read statically ------------------------------
// An expression is data, so the check can rule on unknown terms and bad
// arguments at author time.

const declarativeTask = { ...good, preconditions: ['substantive-change', 'no-open-pr-titled:My sweep'] };

test('task-declaration-shape: a declarative task.json yields no findings', () => {
  assert.deepEqual(run({ [TASK]: json(declarativeTask) }), []);
});

test('task-declaration-shape: the expression is judged term by term', () => {
  const whatsFor = (preconditions) => whatsOf({ [TASK]: json({ ...declarativeTask, preconditions }) });
  assert.match(whatsFor(['no-such-thing']), /unknown condition "no-such-thing"/);
  assert.match(whatsFor(['commits-under']), /takes an inline argument and was given none/);
  assert.match(whatsFor(['substantive-change:oops']), /takes no argument/);
  assert.match(whatsFor(['none', 'substantive-change']), /"none" is retired/);
  assert.match(whatsFor(['substantive-change ||']), /alternative around "\|\|" is empty/);
  // A list that is not one of strings is unreadable to a reader and to this check alike.
  assert.match(whatsFor([{ name: 'substantive-change' }]), /not a literal list of condition strings/);
});

test('task-declaration-shape: a task-local term resolves from the preconditions.mjs beside it', () => {
  const TERMS = TASK.replace('task.json', 'preconditions.mjs');
  const withOwnTerm = json({ ...declarativeTask, preconditions: ['my-own-gate'] });

  // Without the sibling, the condition is a typo as far as anyone can tell.
  assert.match(whatsOf({ [TASK]: withOwnTerm }), /unknown condition "my-own-gate"/);

  assert.deepEqual(run({
    [TASK]: withOwnTerm,
    [TERMS]: "export const terms = {\n  'my-own-gate': { signals: ['stamp'], holds: () => ({ holds: true }) },\n};\n",
  }), []);
});

// BOTH RETIRED SPELLINGS ARE FLAGGED BY NAME (#1617). A declaration carrying one
// is told what replaced it, rather than reading as a task that simply forgot its
// gate — which is what a bare "unknown field" would have said.
test('task-declaration-shape: the retired precondition spellings are named, not merely unrecognised', () => {
  assert.match(whatsOf({ [TASK]: json({ ...declarativeTask, precondition: 'x' }) }), /declares "precondition", which is retired/);
  assert.match(whatsOf({ [TASK]: json({ ...declarativeTask, precondition_signals: ['commits'] }) }), /declares "precondition_signals", which is retired/);
  // A task with the retired field and no `preconditions` runs always — the
  // retired field is still named so the author knows it declares nothing.
  const { preconditions, ...onlyRetired } = { ...declarativeTask, precondition: 'x' };
  assert.match(whatsOf({ [TASK]: json(onlyRetired) }), /which is retired/);
});

test('task-declaration-shape: a none task needs no execution bound but flags code_work without a timeout', () => {
  const { code_work_timeout, ...noTimeout } = noneTask;
  const whats = whatsOf({ [TASK]: json(noTimeout) });
  assert.doesNotMatch(whats, /agent_execution_timeout/);        // none = no agent, no bound needed
  assert.match(whats, /no numeric "code_work_timeout"/);
});

test('task-declaration-shape: flags an agentless (none) task that declares no code_work', () => {
  assert.match(whatsOf({ [TASK]: json({ id: 'x', preconditions: ['schedule:at-most-daily'], agent_model: 'none', expected_outcome: 'none' }) }), /declares no work step/);
});

test('task-declaration-shape: a none task with no agent_instructions is clean — the field is not applicable', () => {
  assert.deepEqual(run({ [TASK]: json(noneTask) }), []);
});

test('task-declaration-shape: flags a code_work command that escapes the task directory', () => {
  assert.match(whatsOf({ [TASK]: json({ ...good, code_work: 'node ../evil.mjs', code_work_timeout: 120 }) }), /reaches outside the task directory/);
});

test('task-declaration-shape: a well-formed task with code_work + both timeouts is clean', () => {
  assert.deepEqual(run({ [TASK]: json({ ...good, code_work: 'node prepare.mjs', code_work_timeout: 300 }) }), []);
});

// --- the trigger (#1725) ---------------------------------------------------------

test('task-declaration-shape: the trigger is required, and its value checked', () => {
  assert.deepEqual(run({ [TASK]: json({ ...good, trigger: 'request', preconditions: ['substantive-change'] }) }), []);
  // Nothing derives it any more, so a declaration stating none is one the contract
  // refuses — caught here at the line an author edits rather than at the door, where
  // it reads only as a task absent from the roster.
  const { trigger, ...none } = good;
  const missing = run({ [TASK]: json(none) });
  assert.equal(missing.length, 1, JSON.stringify(missing));
  assert.equal(missing[0].severity, 'blocking');
  assert.match(missing[0].what, /declares no "trigger"/);
  assert.match(missing[0].fix, /schedule, request/);
  assert.match(whatsOf({ [TASK]: json({ ...good, trigger: 'cron' }) }), /"trigger" is "cron", not a legal value/);
  assert.match(whatsOf({ [TASK]: json({ ...good, trigger: true }) }), /"trigger" is true, not a legal value/);
});

// The sim's S79 is what establishes this: a wake stands in for the cadence, and
// every occurrence of a request task is a wake, so the term declines nothing ever.
test('task-declaration-shape: a request task may not state a cadence it can never be held by', () => {
  assert.match(whatsOf({ [TASK]: json({ ...good, trigger: 'request', preconditions: ['schedule:at-most-daily'] }) }),
    /a "request" task states a cadence term/);
  assert.match(whatsOf({ [TASK]: json({ ...good, trigger: 'request', preconditions: ['due:weekly'] }) }),
    /a "request" task states a cadence term/, 'the retired spelling is the same term');
  // Its other conditions are judged at pick like anyone's, so they are fine.
  assert.deepEqual(run({ [TASK]: json({ ...good, trigger: 'request', preconditions: ['substantive-change'] }) }), []);
  assert.deepEqual(run({ [TASK]: json({ ...good, trigger: 'schedule', preconditions: ['schedule:at-most-daily'] }) }), []);
});

test('task-declaration-shape: a scheduled task may not gate on a condition that reads the item', () => {
  const terms = [
    'export const terms = {',
    '  "about-this-issue": {',
    '    signals: [],',
    '    needsItem: true,',
    '    holds: () => ({ holds: true }),',
    '  },',
    '};',
  ].join('\n');
  const files = (trigger) => ({
    [TASK]: json({ ...good, trigger, preconditions: ['about-this-issue'] }),
    '.claudinite/local/packs/mypack/tasks/acme-task-h/preconditions.mjs': terms,
  });
  assert.match(whatsOf(files('schedule')), /a "schedule" task states a condition that reads the item itself/);
  assert.deepEqual(run(files('request')), [], 'the same expression is exactly right for a task nothing asks');
});

test('task-declaration-shape: a task-local term may declare that it takes an argument', () => {
  const terms = (takesArg) => [
    'export const terms = {',
    '  "window-has-sessions": {',
    '    signals: [],',
    ...(takesArg ? ['    takesArg: true,'] : []),
    '    holds: () => ({ holds: true }),',
    '  },',
    '};',
  ].join('\n');
  const files = (takesArg) => ({
    [TASK]: json({ ...good, preconditions: ['window-has-sessions:10'] }),
    '.claudinite/local/packs/mypack/tasks/acme-task-h/preconditions.mjs': terms(takesArg),
  });
  assert.deepEqual(run(files(true)), [], 'a term that says it takes one may be given one');
  assert.match(whatsOf(files(false)), /takes no argument but was given "10"/,
    'and one that does not say so still cannot — the declaration is what a reader checks against');
});
