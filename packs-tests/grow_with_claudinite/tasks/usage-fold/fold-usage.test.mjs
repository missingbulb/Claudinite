import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUserMessage, commandName, skillToolLoads, countEntries,
  hookCheckRuns, checkSummaries, findingHeaders, checkInvocations, checkOutputs, countChecks,
  foldDays, isoWeek, daysToFold, addDayToWeek, foldUsage,
} from '../../../../packs/grow_with_claudinite/tasks/usage-fold/fold-usage.mjs';

// --- entry fixtures -----------------------------------------------------------
// Every shape below is copied from real captured transcripts on a conversation-logs
// branch — the counting is only as good as these being the real thing, so they are
// not invented.

const human = (text) => ({
  type: 'user', origin: { kind: 'human' }, promptSource: 'sdk', userType: 'external',
  message: { content: text },
});
const toolResult = () => ({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } });
const meta = (text) => ({ type: 'user', isMeta: true, message: { content: text } });
const sidechainUser = (text) => ({ type: 'user', isSidechain: true, message: { content: text } });
const scheduledFiring = (text) => ({
  type: 'user', origin: { kind: 'task-notification', subkind: 'scheduled-trigger' },
  message: { content: text },
});
const taskNotification = (text) => ({ type: 'user', origin: { kind: 'task-notification' }, message: { content: text } });
const compactSummary = () => ({
  type: 'user', isCompactSummary: true, isVisibleInTranscriptOnly: true,
  message: { content: 'This session is being continued from a previous conversation…' },
});
const slash = (name, args = '') => ({
  type: 'user',
  message: { content: `<command-name>/${name}</command-name>\n<command-message>${name}</command-message>\n<command-args>${args}</command-args>` },
});
const commandStdout = () => ({ type: 'user', message: { content: '<local-command-stdout>Set model to opus</local-command-stdout>' } });
const skillCall = (skill, { sidechain = false } = {}) => ({
  type: 'assistant', ...(sidechain ? { isSidechain: true } : {}),
  message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
});
const assistantText = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const otherTool = () => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x' } }] } });

// --- userMessages: the most fragile line in the fold --------------------------

test('isUserMessage counts a human turn and nothing else', () => {
  assert.equal(isUserMessage(human('do the thing')), true);
});

test('isUserMessage excludes every non-human user-role shape', () => {
  // One assertion per shape, deliberately: this is the heuristic the denominators
  // rest on, and a regression in any single shape silently changes every ratio.
  for (const [what, entry] of [
    ['a tool result', toolResult()],
    ['an injected/meta turn', meta('<system-reminder>…</system-reminder>')],
    ['a subagent sidechain turn', sidechainUser('go')],
    ['a scheduled-task firing', scheduledFiring('Execute the Claudinite executor: engine/scheduler/executor.md')],
    ['a task notification', taskNotification('<task-notification>…')],
    ['a compaction summary', compactSummary()],
    ['a slash-command expansion', slash('model', 'claude-opus-5')],
    ['a local command\'s stdout', commandStdout()],
    ['an assistant turn', assistantText('sure')],
  ]) {
    assert.equal(isUserMessage(entry), false, `${what} must not count as a user message`);
  }
});

// --- userCommands and skill loads ---------------------------------------------

test('commandName reads the typed command out of its expansion, and only from there', () => {
  assert.equal(commandName(slash('merge-to-main')), 'merge-to-main');
  assert.equal(commandName(slash('model', 'claude-opus-5')), 'model');
  // prose that merely mentions a slash command is not a command
  assert.equal(commandName(human('run /merge-to-main when you are done')), null);
  assert.equal(commandName(assistantText('use /review')), null);
});

test('skillToolLoads reads the Skill tool_use, ignoring every other tool', () => {
  assert.deepEqual(skillToolLoads(skillCall('writing-tests')), ['writing-tests']);
  assert.deepEqual(skillToolLoads(otherTool()), []);
  assert.deepEqual(skillToolLoads(human('hi')), []);
});

test('countEntries: a typed /command naming a mounted skill is a load; a built-in is not', () => {
  const mounted = new Set(['merge-to-main', 'writing-tests']);
  const counts = countEntries([
    slash('merge-to-main'),   // a skill — one event, two axes
    slash('model', 'opus'),   // a built-in CLI command — never a skill load
    slash('clear'),
  ], mounted);
  assert.equal(counts.userCommands, 3, 'every typed command counts as a command');
  assert.deepEqual(counts.skillLoads, { 'merge-to-main': 1 }, 'only the one naming a mounted skill is a load');
});

test('countEntries: subagent skill loads count — a subagent loading a skill is a load', () => {
  const counts = countEntries([skillCall('writing-tests', { sidechain: true }), skillCall('writing-tests')]);
  assert.deepEqual(counts.skillLoads, { 'writing-tests': 2 });
});

test('countEntries: a whole session, every counter at once', () => {
  const counts = countEntries([
    human('start'), otherTool(), toolResult(),
    skillCall('bug-investigation'), assistantText('found it'),
    human('now merge'), slash('merge-to-main'), skillCall('merge-to-main'),
    scheduledFiring('automated'), meta('<system-reminder>'),
  ], new Set(['merge-to-main', 'bug-investigation']));
  assert.equal(counts.userMessages, 2);
  assert.equal(counts.userCommands, 1);
  // the typed /merge-to-main AND the Skill tool_use are two separate loads
  assert.deepEqual(counts.skillLoads, { 'bug-investigation': 1, 'merge-to-main': 2 });
});

// --- check activations --------------------------------------------------------
// Same discipline as above: every string below is copied out of a real capture on a
// conversation-logs branch. The checks leave no metrics file, so these marks in the
// transcript ARE the measurement — invent them and the counts measure nothing.

// The Stop hook's stderr, verbatim: hooklog mirrors to stderr and the harness
// records it, which is the only reason a PASSING check run is countable at all.
const HOOK_PASS = '2026-07-28T22:14:43Z run=4421 Stop: start checks\n'
  + '2026-07-28T22:14:43Z run=4421 Stop: done exit=0 checks-passed\n';
const HOOK_FAIL = 'Stop hook feedback:\n[node $CLAUDE_PROJECT_DIR/engine/hooks/stop-command.mjs]: '
  + '2026-07-28T22:14:19Z run=3614 Stop: start checks\n'
  + 'Claudinite conformance checks failed — fix these findings now, in this session:\n\n'
  + '[BLOCKING] comment-classification  (conversation)\n'
  + '  the reply to the owner\'s latest comment ("lgtm…") declares no `Comment class:` line\n'
  + '  Fix: state the classification explicitly\n'
  + '  More: packs/basics/RULES.md\n\n'
  + '[BLOCKING] task-lifecycle  (branch)\n'
  + '  none of the 1 commit(s) since origin/main references an issue (#N)\n'
  + '  Fix: reference the issue in the commit message\n\n'
  + '2 blocking, 0 advisory (work scope: all vs origin/main).\n'
  + '2026-07-28T22:14:19Z run=3614 Stop: done exit=2 blocking-findings\n';

const hookFeedback = (text) => ({ type: 'user', isMeta: true, message: { content: text } });
const hookSummary = (text) => ({ type: 'system', subtype: 'stop_hook_summary', hookErrors: [text] });
const hookSuccess = (stderr, stdout = '') => ({
  type: 'attachment',
  attachment: { type: 'hook_success', hookName: 'Stop', hookEvent: 'Stop', stderr, stdout, exitCode: 0 },
});
const bash = (id, command) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } });
const bashResult = (id, stdout) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: stdout }] },
  toolUseResult: { stdout, stderr: '', interrupted: false, isImage: false },
});
const readResult = (id, content) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
  toolUseResult: { type: 'text', file: { content } },
});

test('hookCheckRuns reads the hook\'s own completion line, with the outcome it declares', () => {
  assert.deepEqual(hookCheckRuns(HOOK_PASS), [{ stamp: '2026-07-28T22:14:43Z 4421', exit: 0, reason: 'checks-passed' }]);
  assert.deepEqual(hookCheckRuns(HOOK_FAIL), [{ stamp: '2026-07-28T22:14:19Z 3614', exit: 2, reason: 'blocking-findings' }]);
  // The other two outcomes the hook emits — both matter, and neither prints findings.
  assert.equal(hookCheckRuns('2026-07-28T10:00:00Z run=7 Stop: done exit=0 loop-guard-relent')[0].reason, 'loop-guard-relent');
  assert.equal(hookCheckRuns('2026-07-28T10:00:00Z run=7 Stop: done exit=2 runner-error')[0].reason, 'runner-error');
  assert.deepEqual(hookCheckRuns('2026-07-28T10:00:00Z run=7 Stop: start checks'), [], 'a start is not a run — only a completion is');
});

test('checkSummaries reads the scope and the finding counts off report-findings\' summary line', () => {
  assert.deepEqual(checkSummaries('2 blocking, 0 advisory (work scope: all vs origin/main).'),
    [{ scope: 'work', blocking: 2, advisory: 0 }]);
  assert.deepEqual(checkSummaries('# tests 810\n# pass 810\n0 blocking, 7 advisory (world scope: all vs origin/main).'),
    [{ scope: 'world', blocking: 0, advisory: 7 }]);
  // Anchored to the line start, so a doc or a session quoting the shape is not a run.
  assert.deepEqual(checkSummaries('the runner prints 2 blocking, 0 advisory (work scope: all) at the end'), []);
});

test('findingHeaders reads the rule id off each rendered finding', () => {
  assert.deepEqual(findingHeaders(HOOK_FAIL), [
    { severity: 'blocking', rule: 'comment-classification' },
    { severity: 'blocking', rule: 'task-lifecycle' },
  ]);
  assert.deepEqual(findingHeaders('[ADVISORY] file-placement  packs/x/y.mjs:3'), [{ severity: 'advisory', rule: 'file-placement' }]);
});

test('checkInvocations counts runner invocations, and only actual invocations', () => {
  assert.deepEqual(checkInvocations('node engine/checks/check_the_world.mjs 2>&1 | tail -40'), { work: 0, world: 1 });
  assert.deepEqual(checkInvocations('node .claudinite/shared/engine/checks/check_the_work.mjs >/tmp/out'), { work: 1, world: 0 });
  // Two runners on one line stay two runs — the separator stops one match swallowing the next.
  assert.deepEqual(
    checkInvocations('node engine/checks/check_the_world.mjs | tail -3; node engine/checks/check_the_work.mjs'),
    { work: 1, world: 1 });
  // Talking about the runner is not running it.
  assert.deepEqual(checkInvocations('git ls-files | grep -i "check_the_world" | head'), { work: 0, world: 0 });
});

test('checkOutputs dedupes ONE hook execution recorded under two entry shapes', () => {
  // The harness records a blocking hook run twice — as the feedback turn the model
  // sees, and again in its stop_hook_summary. Counting both would double every
  // failure, which is precisely the number that must not be inflated.
  const outputs = checkOutputs([hookFeedback(HOOK_FAIL), hookSummary(HOOK_FAIL)]);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].source, 'hook');
});

test('checkOutputs takes Bash results and leaves every other tool result alone', () => {
  const outputs = checkOutputs([
    bash('t1', 'node engine/checks/check_the_world.mjs'),
    bashResult('t1', '0 blocking, 7 advisory (world scope: all vs origin/main).'),
    // A Read of a file that merely CONTAINS this vocabulary is not a check run — in
    // the corpus that owns the runners, that is the ordinary case, not a corner one.
    readResult('t2', '[BLOCKING] file-placement  x.mjs\n0 blocking, 1 advisory (world scope: all).'),
  ]);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].command, 'node engine/checks/check_the_world.mjs');
});

test('countChecks: a passing hook run is an activation, not a failure', () => {
  const { checks, checkFindings } = countChecks([hookSuccess(HOOK_PASS)]);
  assert.deepEqual(checks.work, { runs: 1, failures: 0, errors: 0, blocking: 0, advisory: 0 });
  assert.deepEqual(checkFindings, {}, 'nothing was caught, so no rule has a key');
});

test('countChecks: a failing hook run is one activation, one failure, and its rules', () => {
  const { checks, checkFindings } = countChecks([hookFeedback(HOOK_FAIL), hookSummary(HOOK_FAIL)]);
  assert.deepEqual(checks.work, { runs: 1, failures: 1, errors: 0, blocking: 2, advisory: 0 });
  assert.deepEqual(checkFindings, {
    'comment-classification': { blocking: 1, advisory: 0 },
    'task-lifecycle': { blocking: 1, advisory: 0 },
  });
});

test('countChecks: the loop-guard relent is a FAILURE — it prints no findings to give it away', () => {
  // The hook gives up after the same findings survive two fixes and lets the stop
  // through with exit 0. Read only the exit code and a real failure reads as a pass.
  const { checks } = countChecks([hookSuccess(
    '2026-07-28T10:00:00Z run=7 Stop: done exit=0 loop-guard-relent\n',
    'claudinite checks: the same blocking findings survived 2 fix attempts — letting the stop through.',
  )]);
  assert.deepEqual(checks.work, { runs: 1, failures: 1, errors: 0, blocking: 0, advisory: 0 });
});

test('countChecks: a runner that could not launch is an ERROR, never a quiet clean day', () => {
  const { checks } = countChecks([hookFeedback(
    'Stop hook feedback:\n[node …/stop-command.mjs]: 2026-07-28T10:00:00Z run=7 Stop: done exit=2 runner-error\n')]);
  assert.deepEqual(checks.work, { runs: 1, failures: 0, errors: 1, blocking: 0, advisory: 0 });
});

test('countChecks: world-scope runs come off the Bash invocation, so a PASSING sweep still counts', () => {
  const { checks } = countChecks([
    bash('t1', 'node engine/checks/check_the_world.mjs'),
    bashResult('t1', ''),                       // a clean world sweep prints nothing at all
    bash('t2', 'node engine/checks/check_the_world.mjs 2>&1 | tail -5'),
    bashResult('t2', '[BLOCKING] task-lifecycle  (branch)\n  …\n1 blocking, 4 advisory (world scope: all vs origin/main).'),
  ]);
  assert.deepEqual(checks.world, { runs: 2, failures: 1, errors: 0, blocking: 1, advisory: 4 });
});

test('countChecks: a runner wrapped in a test command is counted from its OUTPUT, not double-counted', () => {
  // `make test` / `npm test` invoke the world sweep without naming it, so the summary
  // line is the only evidence. The two signals are two views of the same runs — the
  // count is their max, never their sum.
  const wrapped = countChecks([bash('t1', 'npm test'), bashResult('t1', '0 blocking, 7 advisory (world scope: all vs origin/main).')]);
  assert.equal(wrapped.checks.world.runs, 1);
  const named = countChecks([
    bash('t1', 'node engine/checks/check_the_world.mjs'),
    bashResult('t1', '0 blocking, 7 advisory (world scope: all vs origin/main).'),
  ]);
  assert.equal(named.checks.world.runs, 1, 'named AND reported is still one run');
});

test('countChecks: a scope that never ran has no key — zeros stay implicit here too', () => {
  const { checks } = countChecks([hookSuccess(HOOK_PASS)]);
  assert.deepEqual(Object.keys(checks), ['work']);
});

test('countEntries carries the check counts alongside the skill counts', () => {
  const counts = countEntries([human('go'), skillCall('writing-tests'), hookFeedback(HOOK_FAIL)], new Set(['writing-tests']));
  assert.deepEqual(counts.skillLoads, { 'writing-tests': 1 });
  assert.equal(counts.checks.work.failures, 1);
  assert.equal(counts.checkFindings['task-lifecycle'].blocking, 1);
});

// --- day folding --------------------------------------------------------------

const fileOf = (date, issue, sessionId, counts = {}) => ({
  date, issue, sessionId,
  counts: { userMessages: 0, userCommands: 0, skillLoads: {}, checks: {}, checkFindings: {}, ...counts },
});

test('foldDays: captures, merges and DISTINCT sessions per day', () => {
  const days = foldDays([
    fileOf('2026-07-28', 12, 's1', { userMessages: 4, skillLoads: { a: 1 } }),
    fileOf('2026-07-28', 0, 's1', { userMessages: 2, skillLoads: { a: 1, b: 3 } }), // same session, session-end tail
    fileOf('2026-07-28', 13, 's2', { userMessages: 5, userCommands: 1 }),
    fileOf('2026-07-27', 0, 's0'),
  ]);
  assert.deepEqual(days['2026-07-28'], {
    captures: 3,
    merges: 2,          // issue 0 is a capture, not a merge
    sessions: 2,        // s1 captured twice
    userMessages: 11,
    userCommands: 1,
    skillLoads: { a: 2, b: 3 },
    checks: {},
    checkFindings: {},
  });
  assert.equal(days['2026-07-27'].merges, 0);
});

test('foldDays sums the check activations across a day\'s capture files', () => {
  const work = (over) => ({ runs: 0, failures: 0, errors: 0, blocking: 0, advisory: 0, ...over });
  const days = foldDays([
    fileOf('2026-07-28', 12, 's1', {
      checks: { work: work({ runs: 4, failures: 2, blocking: 3 }), world: work({ runs: 1 }) },
      checkFindings: { 'task-lifecycle': { blocking: 2, advisory: 0 } },
    }),
    fileOf('2026-07-28', 13, 's2', {
      checks: { work: work({ runs: 2, failures: 1, blocking: 1 }) },
      checkFindings: { 'task-lifecycle': { blocking: 1, advisory: 0 }, 'file-placement': { blocking: 0, advisory: 5 } },
    }),
  ]);
  assert.deepEqual(days['2026-07-28'].checks.work, work({ runs: 6, failures: 3, blocking: 4 }));
  assert.deepEqual(days['2026-07-28'].checks.world, work({ runs: 1 }), 'a scope only one file saw still folds');
  assert.deepEqual(days['2026-07-28'].checkFindings, {
    'task-lifecycle': { blocking: 3, advisory: 0 },
    'file-placement': { blocking: 0, advisory: 5 },
  });
});

test('foldDays is a pure recompute — folding the same files twice gives the same rows', () => {
  const files = [fileOf('2026-07-28', 1, 's1', { userMessages: 3, skillLoads: { a: 1 } })];
  assert.deepEqual(foldDays(files), foldDays(files));
});

// --- week folding ---------------------------------------------------------------

test('isoWeek puts a date in its ISO-8601 week, including the year boundary', () => {
  assert.equal(isoWeek('2026-07-28'), '2026-W31');
  assert.equal(isoWeek('2026-07-26'), '2026-W30');   // Sunday closes W30
  assert.equal(isoWeek('2026-07-27'), '2026-W31');   // Monday opens W31
  // 2027-01-01 is a Friday, so it belongs to the week containing its Thursday: 2026-W53
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.equal(isoWeek('2026-01-01'), '2026-W01');
});

test('daysToFold takes every day that CLOSED since the watermark, in order', () => {
  const days = { '2026-07-25': {}, '2026-07-26': {}, '2026-07-27': {}, '2026-07-28': {} };
  assert.deepEqual(daysToFold(days, '2026-07-25', '2026-07-28'), ['2026-07-26', '2026-07-27']);
  assert.deepEqual(daysToFold(days, null, '2026-07-28'), ['2026-07-25', '2026-07-26', '2026-07-27']);
  // today is never folded — its capture files are still arriving
  assert.deepEqual(daysToFold(days, '2026-07-27', '2026-07-28'), []);
});

test('addDayToWeek sums the counters and declares how many days it absorbed', () => {
  const day = {
    captures: 2, merges: 1, sessions: 2, userMessages: 10, userCommands: 1, skillLoads: { a: 1 },
    checks: { work: { runs: 3, failures: 1, errors: 0, blocking: 1, advisory: 0 } },
    checkFindings: { 'task-lifecycle': { blocking: 1, advisory: 0 } },
  };
  const week = addDayToWeek(addDayToWeek(undefined, day), day);
  assert.deepEqual(week, {
    days: 2, captures: 4, merges: 2, sessionDays: 4, userMessages: 20, userCommands: 2, skillLoads: { a: 2 },
    checks: { work: { runs: 6, failures: 2, errors: 0, blocking: 2, advisory: 0 } },
    checkFindings: { 'task-lifecycle': { blocking: 2, advisory: 0 } },
  });
});

test('addDayToWeek extends a week folded BEFORE the checks were counted', () => {
  // Weeks are frozen once folded, so the first fold after this shipped meets week rows
  // that have no `checks` key at all. It must grow them, not throw — a throw here would
  // wedge the watermark and stop every counter, not just the new ones.
  const old = { days: 3, captures: 6, merges: 5, sessionDays: 4, userMessages: 50, userCommands: 2, skillLoads: { a: 1 } };
  const week = addDayToWeek(old, {
    captures: 1, merges: 1, sessions: 1, userMessages: 5, userCommands: 0, skillLoads: {},
    checks: { work: { runs: 2, failures: 1, errors: 0, blocking: 1, advisory: 0 } },
    checkFindings: { 'task-lifecycle': { blocking: 1, advisory: 0 } },
  });
  assert.equal(week.days, 4);
  assert.deepEqual(week.checks.work, { runs: 2, failures: 1, errors: 0, blocking: 1, advisory: 0 });
  assert.equal(week.userMessages, 55, 'and the counters it already had keep summing');
});

// --- the whole fold -------------------------------------------------------------

test('foldUsage: days recompute, weeks append once, watermark advances', () => {
  const files = [
    fileOf('2026-07-26', 1, 's1', { userMessages: 3, skillLoads: { 'merge-to-main': 1 } }),
    fileOf('2026-07-27', 2, 's2', { userMessages: 5 }),
    fileOf('2026-07-28', 0, 's3', { userMessages: 1 }),
  ];
  const first = foldUsage({ files, prior: {}, today: '2026-07-28' });
  assert.equal(first.foldedThrough, '2026-07-27');
  assert.deepEqual(Object.keys(first.weeks), ['2026-W30', '2026-W31']);
  assert.equal(first.weeks['2026-W30'].days, 1);
  assert.deepEqual(first.weeks['2026-W30'].skillLoads, { 'merge-to-main': 1 });
  assert.ok(first.days['2026-07-28'], 'today still has its day row — it just is not folded yet');

  // Same day, run again with a new capture landing on today. The closed days must NOT
  // be folded a second time — this is the whole exactly-once mechanism.
  const second = foldUsage({
    files: [...files, fileOf('2026-07-28', 4, 's4', { userMessages: 2 })],
    prior: first,
    today: '2026-07-28',
  });
  assert.deepEqual(second.weeks, first.weeks, 'a re-run folds no closed day twice');
  assert.equal(second.days['2026-07-28'].captures, 2, 'but today recomputes to include the new capture');

  // Tomorrow: yesterday has closed and folds, once.
  const third = foldUsage({
    files: [...files, fileOf('2026-07-28', 4, 's4', { userMessages: 2 })],
    prior: second,
    today: '2026-07-29',
  });
  assert.equal(third.foldedThrough, '2026-07-28');
  assert.equal(third.weeks['2026-W31'].days, 2);
  assert.equal(third.weeks['2026-W31'].userMessages, 5 + 1 + 2);
});

test('foldUsage: a day whose raw files aged out keeps its week row and drops its day row', () => {
  const prior = foldUsage({
    files: [fileOf('2026-07-20', 1, 's1', { userMessages: 9 })],
    prior: {}, today: '2026-07-21',
  });
  assert.equal(prior.weeks['2026-W30'].userMessages, 9);
  // the raw file has since been pruned — it is simply absent from the next fold
  const later = foldUsage({ files: [], prior, today: '2026-08-01' });
  assert.deepEqual(later.days, {}, 'the day row is gone with its raw backing');
  assert.equal(later.weeks['2026-W30'].userMessages, 9, 'its week row carries it');
  assert.equal(later.foldedThrough, '2026-07-20', 'and the watermark does not skip forward over days it never saw');
});

test('foldUsage sorts every key, so an unchanged recompute is byte-identical', () => {
  const files = [
    fileOf('2026-07-27', 2, 's2', { skillLoads: { zeta: 1, alpha: 2 } }),
    fileOf('2026-07-26', 1, 's1', { skillLoads: { middle: 1 } }),
  ];
  const a = JSON.stringify(foldUsage({ files, prior: {}, today: '2026-07-28' }), null, 2);
  const b = JSON.stringify(foldUsage({ files: [...files].reverse(), prior: {}, today: '2026-07-28' }), null, 2);
  assert.equal(a, b);
  assert.deepEqual(Object.keys(JSON.parse(a).days['2026-07-27'].skillLoads), ['alpha', 'zeta']);
});

test('foldUsage: a mounted skill that never loads has no key — the zero set is derived, not stored', () => {
  const folded = foldUsage({
    files: [fileOf('2026-07-27', 1, 's1', { skillLoads: { 'merge-to-main': 1 } })],
    prior: {}, today: '2026-07-28',
  });
  assert.deepEqual(Object.keys(folded.days['2026-07-27'].skillLoads), ['merge-to-main']);
  // "never loads" is visible by diffing against the repo's mounted set, which is the
  // only way a skill with zero loads can be told from a skill that is not mounted.
  const mounted = ['merge-to-main', 'writing-tests', 'bug-investigation'];
  const never = mounted.filter((s) => !(s in folded.days['2026-07-27'].skillLoads));
  assert.deepEqual(never, ['writing-tests', 'bug-investigation']);
});
