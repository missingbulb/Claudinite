import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/task-declaration-shape.mjs';

const good = {
  id: 'growth-extract',
  description: 'Mines the window for durable lessons and folds them into the local packs.',
  frequency: 'daily',
  agent_model: 'opus',
  expected_outcome: 'pr',
  automerge: 'anything',
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,
  preconditions: ['substantive-change'],
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

// THE AGENTIC FIELDS ARE OPTIONAL. A declaration says what is particular to its
// task; the loader fills `agent_model`, `agent_instructions` and
// `agent_execution_timeout` (task-contract.mjs), so their absence is not a finding.
test('task-declaration-shape: the minimal agentic declaration is clean', () => {
  assert.deepEqual(run({ [TASK]: json({ id: 'growth-extract', description: 'A minimal task.', frequency: 'daily', preconditions: ['none'], expected_outcome: 'none' }) }), []);
});

// …and a declaration of only code_work is agentless without saying so: no
// agent_instructions is asked of it, and the missing-code-work finding cannot fire.
test('task-declaration-shape: a code_work-only declaration is judged as an agentless task', () => {
  assert.deepEqual(run({ [TASK]: json({ id: 'growth-extract', description: 'A minimal task.', frequency: 'daily', preconditions: ['none'], expected_outcome: 'none', code_work: 'node worker.mjs', code_work_timeout: 60 }) }), []);
  // Declaring an agentic field beside code_work makes it agentic again — and the
  // default model is not `none`, so the pair is still clean.
  assert.deepEqual(run({ [TASK]: json({ id: 'growth-extract', description: 'A minimal task.', frequency: 'daily', preconditions: ['none'], expected_outcome: 'none', code_work: 'node worker.mjs', code_work_timeout: 60, agent_execution_timeout: 900 }) }), []);
});

test('task-declaration-shape: a declared agentic field that is not usable still blocks', () => {
  assert.match(whatsOf({ [TASK]: json({ ...good, agent_instructions: 42 }) }), /"agent_instructions" that is not a file name/);
  assert.match(whatsOf({ [TASK]: json({ ...good, agent_execution_timeout: 'soon' }) }), /"agent_execution_timeout" that is not a number/);
  assert.match(whatsOf({ [TASK]: json({ ...good, agent_model: 'gpt' }) }), /"agent_model" is "gpt", not a legal value/);
});

// The description is asked for, never demanded: a member's converted task carries
// none, and its vendor refresh must not go red over it. A bad one blocks.
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
  const whats = whatsOf({ [TASK]: json({ ...good, frequency: 'nightly', agent_model: 'gpt', expected_outcome: 'push' }) });
  assert.match(whats, /"frequency" is "nightly", not a legal value/);
  assert.match(whats, /"agent_model" is "gpt", not a legal value/);
  assert.match(whats, /"expected_outcome" is "push", not a legal value/);
});

// The strict half of the frequency door (tasks-dispatch DESIGN §17.1). The RUNTIME accepts a
// retired spelling forever, because a member's task file is its own data and no vendoring pass
// rewrites it — so the only thing standing between the corpus and a new declaration on the dead
// vocabulary is this author-time check, which runs in the canon.
test('task-declaration-shape: the retired frequency spellings cannot be written anew', () => {
  for (const retired of ['hourly', 'daily-2h', 'daily-1h', 'daily+1h']) {
    const findings = run({ [TASK]: json({ ...good, frequency: retired }) });
    const whats = findings.map((f) => f.what).join(' | ');
    assert.match(whats, new RegExp(`"frequency" is "${retired.replace('+', '\\+')}", not a legal value`),
      `${retired} is rejected at author time`);
    assert.ok(findings.some((f) => f.severity === 'blocking'), `${retired} blocks, not advises`);
    // …and the remedy names only the surviving vocabulary.
    assert.match(findings.find((f) => f.what.includes('frequency')).fix, /use one of: daily, weekly, monthly, manual/);
  }
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
test('task-declaration-shape: the legacy outcome ceilings are an advisory rename', () => {
  for (const [legacy, policy] of [['open-pr', 'nothing'], ['merged-pr', 'anything']]) {
    const { automerge, ...rest } = good;
    const f = run({ [TASK]: json({ ...rest, expected_outcome: legacy }) });
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].severity, 'advisory', `${legacy} never blocks`);
    assert.match(f[0].what, new RegExp(`legacy outcome ceiling "${legacy}"`));
    assert.match(f[0].fix, new RegExp(`"automerge": "${policy}"`));
  }
});

const noneTask = {
  id: 'growth-extract', description: 'An agentless task.', frequency: 'daily', preconditions: ['none'], agent_model: 'none', expected_outcome: 'none',
  code_work: 'node w.mjs', code_work_timeout: 60,
};

test('task-declaration-shape: a pr task without automerge, and a none task with one, block', () => {
  const { automerge, ...missing } = good;
  assert.match(whatsOf({ [TASK]: json(missing) }), /declares no "automerge"/);
  assert.match(whatsOf({ [TASK]: json({ ...noneTask, automerge: 'anything' }) }), /a "none" task declares "automerge"/);
});

test('task-declaration-shape: the canonical `schedule_after` is clean', () => {
  assert.deepEqual(run({ [TASK]: json({ ...good, schedule_after: ['claudinite-lifecycle/update'] }) }), [],
    'the canonical spelling must not match the legacy pattern on its own tail');
});

test('task-declaration-shape: flags missing required fields', () => {
  const whats = whatsOf({ [TASK]: json({ frequency: 'daily', agent_model: 'sonnet' }) });
  assert.match(whats, /declares no string "id"/);
  assert.match(whats, /declares no "expected_outcome"/);
  assert.match(whats, /declares no "preconditions"/);
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
  assert.match(whatsFor(['none', 'substantive-change']), /legal only as the sole entry/);
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
  // A task with the retired field and nothing else is missing its gate too —
  // both findings, so the fix is unambiguous.
  const { preconditions, ...onlyRetired } = { ...declarativeTask, precondition: 'x' };
  const whats = whatsOf({ [TASK]: json(onlyRetired) });
  assert.match(whats, /which is retired/);
  assert.match(whats, /declares no "preconditions"/);
});

test('task-declaration-shape: a none task needs no execution bound but flags code_work without a timeout', () => {
  const { code_work_timeout, ...noTimeout } = noneTask;
  const whats = whatsOf({ [TASK]: json(noTimeout) });
  assert.doesNotMatch(whats, /agent_execution_timeout/);        // none = no agent, no bound needed
  assert.match(whats, /no numeric "code_work_timeout"/);
});

test('task-declaration-shape: flags an agentless (none) task that declares no code_work', () => {
  assert.match(whatsOf({ [TASK]: json({ id: 'x', frequency: 'daily', preconditions: ['none'], agent_model: 'none', expected_outcome: 'none' }) }), /declares no "code_work"/);
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
  const findings = run({ [MJS]: mjsOf({ ...good, frequency: 'nightly' }) });
  assert.match(findings.map((f) => f.what).join(' | '), /"frequency" is "nightly", not a legal value/);
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
  assert.match(whatsOf({ [MJS]: mjsOf(good).replace("['substantive-change']", 'SOME_CONSTANT') }), /not a literal list of condition strings/);
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
