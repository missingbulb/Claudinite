import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/task-declaration-shape.mjs';

const good = {
  id: 'growth-extract',
  description: 'Mines the window for durable lessons and folds them into the local packs.',
  agent_model: 'opus',
  expected_outcome: 'fresh_pr',
  automerge: 'anything',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  preconditions: ['due:daily', 'substantive-change'],
};
const json = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const goodTask = json(good);
const TASK = '.claudinite/local/packs/mypack/tasks/growth-extract/task.json';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
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
  const minimal = { id: 'growth-extract', description: 'A minimal task.', preconditions: ['due:daily'], expected_outcome: 'fresh_pr', code_work: 'node worker.mjs', code_work_timeout: 60 };
  assert.deepEqual(run({ [TASK]: json(minimal) }), []);
  const { code_work_timeout, ...noBound } = minimal;
  assert.match(whatsOf({ [TASK]: json(noBound) }), /no numeric "code_work_timeout"/);
  const { code_work, ...nothing } = noBound;
  assert.match(whatsOf({ [TASK]: json(nothing) }), /declares no "code_work"/);
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
  const whats = whatsOf({ [TASK]: json({ ...good, preconditions: ['due:nightly'], agent_model: 'gpt', expected_outcome: 'push' }) });
  assert.match(whats, /"due" takes one of daily, weekly, monthly, not "nightly"/);
  assert.match(whats, /"agent_model" is "gpt", not a legal value/);
  assert.match(whats, /"expected_outcome" is "push", not a legal value/);
});

// The retired cadence field (tasks-dispatch DESIGN §5). ADVISORY, like every rename here: the
// runtime reads the field as the cadence term it meant, a member's task file is its own data,
// and the nightly update rewrites it — so this finding names the edit and its CI stays green.
test('task-declaration-shape: the retired frequency field is an advisory rename to its cadence term', () => {
  const { preconditions, ...bare } = good;
  for (const [field, term] of [['daily', 'due:daily'], ['weekly', 'due:weekly'], ['monthly', 'due:monthly'], ['manual', null]]) {
    const findings = run({ [TASK]: json({ ...bare, frequency: field, preconditions: ['none'] }) });
    assert.equal(findings.length, 1, `${field}: the field is the one finding — the none beside it is what the door strips`);
    assert.equal(findings[0].severity, 'advisory');
    assert.match(findings[0].what, /retired field "frequency"/);
    // `manual` meant no schedule, which a declaration says by stating nothing.
    assert.match(findings[0].fix, term === null ? /no "preconditions" at all/ : new RegExp(`\\["${term}", …\\]`));
  }
  // A field the door cannot read is still reported as the illegal condition it becomes.
  const findings = run({ [TASK]: json({ ...bare, frequency: 'hourly' }) });
  assert.ok(findings.some((f) => f.severity === 'blocking' && /"due" takes one of daily, weekly, monthly, not "hourly"/.test(f.what)), 'hourly blocks');
  // …and a well-formed expression beside the field is judged as the door reads it: no double term.
  assert.deepEqual(run({ [TASK]: json({ ...bare, frequency: 'daily', preconditions: ['due:daily', 'substantive-change'] }) }).map((f) => f.severity), ['advisory']);
});

// The ordering field's rename. ADVISORY, not blocking: the runtime normalizes `after` at the
// door forever, so a member's own task file keeps its ordering and its CI must not go red over a
// declaration nobody has edited. The finding is what drives the fleet to the canonical spelling.
test('task-declaration-shape: the legacy `after` ordering field is an advisory rename', () => {
  const f = run({ [TASK]: json({ ...good, after: ['claudinite-lifecycle/update'] }) });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'advisory', 'never blocking — the runtime still honours it');
  assert.match(f[0].what, /legacy name "after"/);
  assert.match(f[0].fix, /rename "after" to "schedule_after"/);
});

// The outcome-ceiling rename boundary: a member's file still declaring the
// one-word ceilings keeps validating (the runtime normalizes them), and earns
// exactly one advisory naming the ceiling/policy pair to write instead.
test('task-declaration-shape: the legacy `required_secrets` is an advisory rename', () => {
  const f = run({ [TASK]: json({ ...good, required_secrets: ['X'] }) });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'advisory');
  assert.match(f[0].fix, /rename "required_secrets" to "code_work_required_secrets"/);
  assert.deepEqual(run({ [TASK]: json({ ...good, code_work_required_secrets: ['X'] }) }), []);
});

test('task-declaration-shape: the legacy outcome ceilings are an advisory rename', () => {
  for (const [legacy, policy] of [['open-pr', 'nothing'], ['merged-pr', 'anything']]) {
    const { automerge, ...rest } = good;
    const f = run({ [TASK]: json({ ...rest, expected_outcome: legacy }) });
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].severity, 'advisory', `${legacy} never blocks`);
    assert.match(f[0].what, new RegExp(`legacy outcome ceiling "${legacy}"`));
    assert.match(f[0].fix, new RegExp(`"automerge": "${policy}"`));
  }
  // The two-word generation renames the same way: an advisory naming the word it
  // became, never a block on a declaration nobody edited.
  for (const [legacy, today] of [['none', 'no_code_changes'], ['pr', 'fresh_pr']]) {
    const { automerge, ...rest } = good;
    const f = run({ [TASK]: json({ ...rest, expected_outcome: legacy }) });
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].severity, 'advisory', `${legacy} never blocks`);
    assert.match(f[0].what, new RegExp(`legacy outcome ceiling "${legacy}"`));
    assert.match(f[0].fix, new RegExp(`"expected_outcome": "${today}"`));
  }
  for (const outcome of ['amend_existing_or_create_new_pr', 'supersede_existing_pr']) {
    assert.deepEqual(run({ [TASK]: json({ ...good, expected_outcome: outcome }) }), [], outcome);
  }
});

const noneTask = {
  id: 'growth-extract', description: 'An agentless task.', preconditions: ['due:daily'], agent_model: 'none', expected_outcome: 'no_code_changes',
  code_work: 'node w.mjs', code_work_timeout: 60,
};

test('task-declaration-shape: a pr task without automerge lands nothing, and a none task with one blocks', () => {
  const { automerge, ...missing } = good;
  assert.deepEqual(run({ [TASK]: json(missing) }), []);
  assert.match(whatsOf({ [TASK]: json({ ...noneTask, automerge: 'anything' }) }), /a "no_code_changes" task declares "automerge"/);
  // The retired word is judged as the one it became, beside its rename advisory.
  assert.match(whatsOf({ [TASK]: json({ ...noneTask, expected_outcome: 'none', automerge: 'anything' }) }), /a "no_code_changes" task declares "automerge"/);
});

test('task-declaration-shape: the canonical `schedule_after` is clean', () => {
  assert.deepEqual(run({ [TASK]: json({ ...good, schedule_after: ['claudinite-lifecycle/update'] }) }), [],
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
  assert.match(whatsOf({ [TASK]: json({ id: 'x', preconditions: ['due:daily'], agent_model: 'none', expected_outcome: 'none' }) }), /declares no "code_work"/);
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

// The 2026-08-06 rename boundary: a member's local pack still declaring the
// legacy code-work names must keep working — the loader normalizes them — and the
// vendor refresh must not turn its CI red over files nothing has renamed yet.
// So the legacy declaration is contract-complete (no missing-code-work, no
// missing-timeout findings) and earns exactly one ADVISORY rename nudge.
test('task-declaration-shape: legacy agent_preprocessing names satisfy the contract, advisory rename only', () => {
  const { code_work, code_work_timeout, ...rest } = noneTask;
  const findings = run({ [TASK]: json({ ...rest, agent_preprocessing: 'node worker.mjs', agent_preprocessing_timeout: 120 }) });
  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.equal(findings[0].severity, 'advisory');
  assert.match(findings[0].what, /legacy name/);
  assert.match(findings[0].fix, /"agent_preprocessing" → "code_work"/);
});

// --- the retired module form ---------------------------------------------------
// A `task.mjs` still loads (task-declaration.mjs), so it is judged on the same
// contract, plus exactly one ADVISORY naming the conversion: a member's vendor
// refresh must not turn its CI red over a file its own nightly update converts.

const MJS = TASK.replace('task.json', 'task.mjs');
const mjsOf = (obj) => `export default {\n${Object.entries(obj).map(([k, v]) => `  ${k}: ${JSON.stringify(v).replace(/"/g, "'")},`).join('\n')}\n};\n`;
const conversionAdvisory = (findings) => findings.filter((f) => f.severity === 'advisory' && /retired module form/.test(f.what));

test('task-declaration-shape: a well-formed task.mjs earns the conversion advisory and nothing else', () => {
  const findings = run({ [MJS]: mjsOf(good) });
  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.match(findings[0].what, /retired module form/);
  assert.equal(conversionAdvisory(findings).length, 1);
  assert.match(findings[0].fix, /task-declarations-to-json\.mjs/);
});

test('task-declaration-shape: a task.mjs is judged on the same contract', () => {
  const findings = run({ [MJS]: mjsOf({ ...good, preconditions: ['due:nightly'] }) });
  assert.match(findings.map((f) => f.what).join(' | '), /"due" takes one of daily, weekly, monthly, not "nightly"/);
  assert.equal(conversionAdvisory(findings).length, 1);
});

test('task-declaration-shape: a comment naming automerge is not a declaration of it', () => {
  const commented = mjsOf(noneTask).replace("expected_outcome: 'none',", "expected_outcome: 'none', // not automerge: material");
  assert.equal(run({ [MJS]: commented }).length, 1, 'only the conversion advisory');
});

test('task-declaration-shape: the retired precondition function is named in a task.mjs', () => {
  const withFunction = mjsOf(declarativeTask).replace("  agent_model: 'opus',", "  precondition(signals) { return { run: true }; },\n  agent_model: 'opus',");
  assert.match(whatsOf({ [MJS]: withFunction }), /declares a "precondition" function, which is retired/);
});

test('task-declaration-shape: a computed expression in a task.mjs is unreadable', () => {
  assert.match(whatsOf({ [MJS]: mjsOf(good).replace("['due:daily','substantive-change']", 'SOME_CONSTANT') }), /not a literal list of condition strings/);
});

test('task-declaration-shape: flags a non-object export', () => {
  const f = run({ [MJS]: 'export default 42;\n' });
  assert.equal(f.filter((x) => x.severity === 'blocking').length, 1);
  assert.match(f.find((x) => x.severity === 'blocking').what, /does not default-export a declaration object/);
});

// A relocation leaves the old path behind as a re-export so a fielded caller still
// resolves. That file declares nothing of its own — judging it would fail the task on
// text it does not carry, while the real declaration is scanned where it now lives.
test('task-declaration-shape: a legacy-path re-export shim is not a declaration to judge', () => {
  const shim = '.claudinite/local/packs/oldpack/tasks/growth-extract/task.mjs';
  assert.deepEqual(run({
    [TASK]: goodTask,
    [shim]: "// A legacy-path shim.\nimport './legacy-entry.mjs';\nexport * from '../../../mypack/tasks/growth-extract/task.json' with { type: 'json' };\nexport { default } from '../../../mypack/tasks/growth-extract/task.mjs';\n",
  }), []);
});

// …and an empty file is not a shim: nothing re-exports, so the missing declaration is real.
test('task-declaration-shape: an empty task.mjs is still flagged', () => {
  const findings = run({ [MJS]: '// nothing here\n' });
  assert.match(findings.find((x) => x.severity === 'blocking').what, /does not default-export a declaration object/);
});

// --- the trigger (#1725) ---------------------------------------------------------

test('task-declaration-shape: a stated trigger is checked; an unstated one is the advisory\'s', () => {
  assert.deepEqual(run({ [TASK]: json({ ...good, trigger: 'schedule' }) }), []);
  assert.deepEqual(run({ [TASK]: json({ ...good, trigger: 'request' }) }), []);
  // Absent is legal here — the door derives it, and `legacy-task-fields` is what
  // asks for it. This check must not double up on that as a blocking finding.
  assert.deepEqual(run({ [TASK]: goodTask }), []);
  assert.match(whatsOf({ [TASK]: json({ ...good, trigger: 'cron' }) }), /"trigger" is "cron", not a legal value/);
  assert.match(whatsOf({ [TASK]: json({ ...good, trigger: true }) }), /"trigger" is true, not a legal value/);
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
    '.claudinite/local/packs/mypack/tasks/growth-extract/preconditions.mjs': terms,
  });
  assert.match(whatsOf(files('schedule')), /a "schedule" task states a condition that reads the item itself/);
  assert.deepEqual(run(files('request')), [], 'the same expression is exactly right for a task nothing asks');
});
