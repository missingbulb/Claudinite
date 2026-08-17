import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUserMessage, commandName, skillToolLoads, countEntries,
  hookCheckRuns, checkSummaries, findingHeaders, checkInvocations, checkOutputs, countChecks,
  foldDays, isoWeek, daysToFold, addDayToWeek, foldUsage, foldTaskRuns, withinTaskWindow,
  countTaskExecs, emptyTaskExec, encodeUsage, decodeUsage,
} from '../../../../packs/grow_with_claudinite/tasks/usage-fold/fold-usage.mjs';
import { renderJsonFile } from '../../../../engine/scheduler/render-json.mjs';
import { USAGE_FIELDS, USAGE_VERSION } from '../../../../packs/grow_with_claudinite/tasks/usage-fold/usage-format.mjs';

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
// A CI job log the session pulled in: an MCP tool call, and a result whose text
// reaches the transcript as content blocks rather than as `{ stdout }`. Every line
// of an Actions log carries the runner's own timestamp in front of the output.
// The payload is a JSON document inside a text block, so the log's newlines arrive
// ESCAPED — copied from a real capture, because a fixture with real newlines would
// pass while every actual CI log matched nothing.
const ciFetch = (id) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'mcp__github__get_job_logs', input: { job_id: 1 } }] } });
const ciResult = (id, logs) => {
  const text = JSON.stringify({ job_id: 90518898761, logs_content: logs });
  return {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] },
    toolUseResult: [{ type: 'text', text }],
  };
};
const CI_LOG = '2026-07-29T08:12:04.1234567Z ##[group]Run node engine/checks/check_the_world.mjs\n'
  + '2026-07-29T08:12:05.7654321Z [BLOCKING] task-lifecycle  (branch)\n'
  + '2026-07-29T08:12:05.7654322Z   none of the 1 commit(s) since origin/main references an issue (#N)\n'
  + '2026-07-29T08:12:05.7654323Z 1 blocking, 4 advisory (world scope: all vs origin/main).\n'
  + '2026-07-29T08:12:05.9000000Z ##[error]Process completed with exit code 1.\n';

// One place for the per-scope row shape, so adding a counter is one edit rather than
// a sweep through every assertion that names the whole row.
const scopeRow = (over) => ({ runs: 0, failures: 0, errors: 0, blocking: 0, advisory: 0, ciRuns: 0, ciFailures: 0, ...over });

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
  assert.deepEqual(checks.work, scopeRow({ runs: 1 }));
  assert.deepEqual(checkFindings, {}, 'nothing was caught, so no rule has a key');
});

test('countChecks: a failing hook run is one activation, one failure, and its rules', () => {
  const { checks, checkFindings } = countChecks([hookFeedback(HOOK_FAIL), hookSummary(HOOK_FAIL)]);
  assert.deepEqual(checks.work, scopeRow({ runs: 1, failures: 1, blocking: 2 }));
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
  assert.deepEqual(checks.work, scopeRow({ runs: 1, failures: 1 }));
});

test('countChecks: a runner that could not launch is an ERROR, never a quiet clean day', () => {
  const { checks } = countChecks([hookFeedback(
    'Stop hook feedback:\n[node …/stop-command.mjs]: 2026-07-28T10:00:00Z run=7 Stop: done exit=2 runner-error\n')]);
  assert.deepEqual(checks.work, scopeRow({ runs: 1, errors: 1 }));
});

test('countChecks: world-scope runs come off the Bash invocation, so a PASSING sweep still counts', () => {
  const { checks } = countChecks([
    bash('t1', 'node engine/checks/check_the_world.mjs'),
    bashResult('t1', ''),                       // a clean world sweep prints nothing at all
    bash('t2', 'node engine/checks/check_the_world.mjs 2>&1 | tail -5'),
    bashResult('t2', '[BLOCKING] task-lifecycle  (branch)\n  …\n1 blocking, 4 advisory (world scope: all vs origin/main).'),
  ]);
  assert.deepEqual(checks.world, scopeRow({ runs: 2, failures: 1, blocking: 1, advisory: 4 }));
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

test('a GitHub Actions timestamp prefix does not hide the marks', () => {
  // Actions stamps every log line before the command's own output. Anchoring to the
  // bare line start would make every fetched CI log read as having printed nothing.
  assert.deepEqual(checkSummaries(CI_LOG), [{ scope: 'world', blocking: 1, advisory: 4 }]);
  assert.deepEqual(findingHeaders(CI_LOG), [{ severity: 'blocking', rule: 'task-lifecycle' }]);
});

test('checkOutputs decodes the JSON-wrapped CI payload, so the log has real lines again', () => {
  // Every mark is line-anchored. Left encoded, the whole job log is ONE line and the
  // CI counting silently measures nothing at all — the failure mode that looks like
  // "CI just never catches anything".
  const [output] = checkOutputs([ciFetch('c1'), ciResult('c1', CI_LOG)]);
  assert.equal(output.source, 'ci');
  assert.ok(output.text.includes('\n'), 'the escaped newlines are real newlines by the time a mark reads them');
  assert.deepEqual(checkSummaries(output.text), [{ scope: 'world', blocking: 1, advisory: 4 }]);
});

test('countChecks: a CI run the session pulled the log for IS counted', () => {
  // write → commit → let CI run → fix what it caught is the same correction loop as
  // the Stop hook's, one turn wider, and its failures are the same kind of win.
  const { checks, checkFindings } = countChecks([ciFetch('c1'), ciResult('c1', CI_LOG)]);
  assert.deepEqual(checks.world, scopeRow({ runs: 1, failures: 1, blocking: 1, advisory: 4, ciRuns: 1, ciFailures: 1 }));
  assert.deepEqual(checkFindings, { 'task-lifecycle': { blocking: 1, advisory: 0 } });
});

test('countChecks: the CI share stays separable, because CI can only see runs that PRINTED', () => {
  // A green CI sweep prints nothing, so it is invisible — which would skew any rate
  // computed over a total that mixed the two sources without saying so.
  const { checks } = countChecks([
    bash('t1', 'node engine/checks/check_the_world.mjs'), bashResult('t1', ''),
    ciFetch('c1'), ciResult('c1', CI_LOG),
  ]);
  assert.equal(checks.world.runs, 2);
  assert.equal(checks.world.ciRuns, 1);
  assert.equal(checks.world.runs - checks.world.ciRuns, 1, 'the session-observed runs stay derivable');
});

test('countChecks: re-reading one CI job log is still one run', () => {
  // Iterating on a CI failure means fetching the same log more than once. Nothing in
  // a fetch says WHICH run it was, so the check output is the identity.
  const { checks } = countChecks([ciFetch('c1'), ciResult('c1', CI_LOG), ciFetch('c2'), ciResult('c2', CI_LOG)]);
  assert.equal(checks.world.runs, 1);
  const next = countChecks([
    ciFetch('c1'), ciResult('c1', CI_LOG),
    ciFetch('c2'), ciResult('c2', CI_LOG.replaceAll('08:12:05', '09:30:11')),
  ]);
  assert.equal(next.checks.world.runs, 2, 'a genuinely later run differs by its Actions timestamps');
});

test('countChecks: a CI log carrying no check output at all is not a run', () => {
  const { checks } = countChecks([ciFetch('c1'), ciResult('c1',
    '2026-07-29T08:12:04.1234567Z ##[group]Run npm ci\n2026-07-29T08:12:09.0000000Z added 0 packages\n')]);
  assert.deepEqual(checks, {});
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
    tasks: {}, taskExec: {},
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
    tasks: {}, taskExec: {},
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

test('the written file sorts every key, so an unchanged recompute is byte-identical', () => {
  // Sorting is the ENCODER's job — the fold works in whatever order the sources
  // arrived, and the file is what has to be stable, because a byte-identical recompute
  // is what stops the delivery opening a daily no-op PR.
  const files = [
    fileOf('2026-07-27', 2, 's2', { skillLoads: { zeta: 1, alpha: 2 } }),
    fileOf('2026-07-26', 1, 's1', { skillLoads: { middle: 1 } }),
  ];
  const written = (input) => renderJsonFile(encodeUsage(foldUsage({ files: input, prior: {}, today: '2026-07-28' })));
  const a = written(files);
  assert.equal(a, written([...files].reverse()));
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

// --- task invocations -----------------------------------------------------------
// The second source: what the SCHEDULER did with each task, from its own run
// records. Unlike everything above, these rows are appended once past their own
// watermark rather than recomputed — the trade the fold makes because the scheduler's
// logs are a rate-limited REST read and the logs branch is local git.

const runOf = (date, task, outcome, pack = 'grow_with_claudinite') => ({ date, pack, task, outcome });

test('foldTaskRuns counts each outcome per task, on the day the run started', () => {
  const days = {};
  foldTaskRuns(days, {}, [
    runOf('2026-07-28', 'usage-fold', 'prework'),
    runOf('2026-07-28', 'usage-fold', 'skipped'),
    runOf('2026-07-28', 'usage-fold', 'skipped'),
    runOf('2026-07-28', 'growth-extract', 'agent'),
    runOf('2026-07-27', 'growth-extract', 'failed'),
  ], '2026-07-28');
  assert.deepEqual(days['2026-07-28'].tasks['grow_with_claudinite/usage-fold'],
    { agent: 0, prework: 1, skipped: 2, failed: 0, deferred: 0 });
  assert.equal(days['2026-07-28'].tasks['grow_with_claudinite/growth-extract'].agent, 1);
  assert.equal(days['2026-07-27'].tasks['grow_with_claudinite/growth-extract'].failed, 1);
  // A day with scheduler activity and no captures still gets a row: a repo whose
  // sessions are all unattended would otherwise show nothing at all for that day.
  assert.equal(days['2026-07-27'].captures, 0);
});

test('foldTaskRuns carries prior day rows forward — they are appended, never recomputed', () => {
  const prior = { '2026-07-28': { tasks: { 'p/t': { agent: 2, prework: 0, skipped: 5, failed: 0, deferred: 0 } } } };
  const days = { '2026-07-28': { captures: 1, tasks: {} } };
  foldTaskRuns(days, prior, [{ date: '2026-07-28', pack: 'p', task: 't', outcome: 'agent' }], '2026-07-28');
  assert.deepEqual(days['2026-07-28'].tasks['p/t'], { agent: 3, prework: 0, skipped: 5, failed: 0, deferred: 0 });
  assert.equal(days['2026-07-28'].captures, 1, 'the recomputed capture counts are untouched');
});

test('foldTaskRuns drops prior task rows past the day window, and ignores unknown outcomes', () => {
  const prior = {
    '2026-07-28': { tasks: { 'p/fresh': { agent: 1 } } },
    '2026-06-01': { tasks: { 'p/ancient': { agent: 9 } } },   // long since folded into its week
  };
  const days = {};
  foldTaskRuns(days, prior, [{ date: '2026-07-28', pack: 'p', task: 't', outcome: 'exploded' }], '2026-07-28');
  assert.ok(days['2026-07-28'].tasks['p/fresh']);
  assert.equal(days['2026-06-01'], undefined);
  assert.equal(days['2026-07-28'].tasks['p/t'], undefined, 'an outcome word the fold does not know mints no counter');
});

test('foldUsage folds task rows into the closing day\'s week, and carries the run watermark', () => {
  const first = foldUsage({
    files: [], prior: {}, today: '2026-07-29',
    taskRuns: [runOf('2026-07-28', 'usage-fold', 'prework'), runOf('2026-07-29', 'usage-fold', 'agent')],
    runsFoldedThrough: '2026-07-29T04:44:00Z',
  });
  assert.equal(first.runsFoldedThrough, '2026-07-29T04:44:00Z');
  assert.equal(first.weeks['2026-W31'].tasks['grow_with_claudinite/usage-fold'].prework, 1,
    'the day that closed carried its task counts into its week');
  assert.equal(first.weeks['2026-W31'].tasks['grow_with_claudinite/usage-fold'].agent, 0,
    'today is not folded — its runs are still arriving');

  // A run that read no new records leaves both the counts and the watermark alone.
  const second = foldUsage({ files: [], prior: first, today: '2026-07-29', taskRuns: [], runsFoldedThrough: null });
  assert.equal(second.runsFoldedThrough, '2026-07-29T04:44:00Z');
  assert.deepEqual(second.days['2026-07-29'].tasks, first.days['2026-07-29'].tasks);
  assert.equal(second.weeks['2026-W31'].tasks['grow_with_claudinite/usage-fold'].prework, 1,
    'and the closed week is not folded a second time');
});

test('addDayToWeek extends a week folded BEFORE task invocations were counted', () => {
  const old = { days: 3, captures: 6, merges: 5, sessionDays: 4, userMessages: 50, userCommands: 2, skillLoads: {} };
  const week = addDayToWeek(old, {
    captures: 0, merges: 0, sessions: 0, userMessages: 0, userCommands: 0, skillLoads: {},
    tasks: { 'p/t': { agent: 1, prework: 0, skipped: 0, failed: 0, deferred: 0 } },
  });
  assert.equal(week.tasks['p/t'].agent, 1);
  assert.equal(week.days, 4);
});

test('withinTaskWindow keeps the last 14 days and nothing older', () => {
  assert.ok(withinTaskWindow('2026-07-29', '2026-07-29'), 'today is in');
  assert.ok(withinTaskWindow('2026-07-16', '2026-07-29'), 'day 13 is in');
  assert.ok(!withinTaskWindow('2026-07-15', '2026-07-29'), 'day 14 has aged out into its week row');
  assert.ok(!withinTaskWindow('2026-07-30', '2026-07-29'), 'a future date is not a window this fold owns');
});

// --- executor execution statuses out of a captured session ----------------------
// The exec records are printed by executor-side code (resolve-dispatch,
// record-exec) into Bash tool results; the model may quote one back. The count
// dedupes on the full tuple so one execution never counts twice.

const execLine = (status, slot = 'd2026-08-06') => `claudinite-task-exec v1 tidy-repo/tidy-issues [${slot}] ${status}`;

test('countTaskExecs reads exec records out of tool-result text', () => {
  const entries = [
    { type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: `brief...\n${execLine('success')}\n` }] }] } },
  ];
  assert.deepEqual(countTaskExecs(entries), {
    'tidy-repo/tidy-issues': { ...emptyTaskExec(), success: 1 },
  });
});

test('countTaskExecs dedupes an echoed record, and keeps distinct statuses/slots', () => {
  const entries = [
    { type: 'user', message: { content: [{ type: 'tool_result', content: `${execLine('failed')}\n` }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: `the run failed: ${execLine('failed')}` }] } },
    { type: 'user', message: { content: `${execLine('failed', 'd2026-08-07')}` } },
  ];
  const counts = countTaskExecs(entries);
  assert.equal(counts['tidy-repo/tidy-issues'].failed, 2); // two slots, echo collapsed
});

test('countEntries carries taskExec beside the other counters', () => {
  const counts = countEntries([
    { type: 'user', message: { content: `${execLine('task-gone')}` } },
  ]);
  assert.deepEqual(counts.taskExec, { 'tidy-repo/tidy-issues': { ...emptyTaskExec(), 'task-gone': 1 } });
});

// --- the file boundary ----------------------------------------------------------
// The fold works in named counters; the file stores positional tuples. These are the
// tests of the seam between the two.

test('a fold round-trips through the file unchanged', () => {
  const folded = foldUsage({
    files: [
      fileOf('2026-07-26', 1, 's1', { skillLoads: { 'merge-to-main': 2 }, checks: { work: { runs: 5, failures: 1 } } }),
      fileOf('2026-07-27', 2, 's2', { skillLoads: { 'writing-tests': 1 } }),
    ],
    prior: {}, today: '2026-07-28',
  });
  const reread = decodeUsage(JSON.parse(renderJsonFile(encodeUsage(folded))));
  assert.equal(reread.foldedThrough, folded.foldedThrough);
  assert.deepEqual(reread.days['2026-07-26'].skillLoads, { 'merge-to-main': 2 });
  assert.equal(reread.days['2026-07-26'].checks.work.failures, 1);
  assert.equal(reread.weeks['2026-W30'].captures, 1);
  // …and folding again from the re-read prior lands in the same place, which is what
  // the next night's run actually does.
  const again = foldUsage({ files: [], prior: reread, today: '2026-07-28' });
  assert.deepEqual(again.weeks, folded.weeks);
});

test('the file states the vocabulary its tuples are spelled in', () => {
  const file = encodeUsage(foldUsage({
    files: [fileOf('2026-07-26', 1, 's1', { checks: { work: { runs: 5, failures: 1 } } })],
    prior: {}, today: '2026-07-27',
  }));
  assert.equal(file.version, USAGE_VERSION);
  assert.deepEqual(file.fields.checks, [...USAGE_FIELDS.checks]);
  const tuple = file.days['2026-07-26'].checks.work;
  assert.equal(tuple[file.fields.checks.indexOf('runs')], 5);
  assert.equal(tuple[file.fields.checks.indexOf('failures')], 1);
});

test('an empty counter group is omitted from the file, never written as {}', () => {
  const file = encodeUsage(foldUsage({
    files: [fileOf('2026-07-26', 1, 's1', {})], prior: {}, today: '2026-07-27',
  }));
  const row = file.days['2026-07-26'];
  assert.equal(row.tasks, undefined);
  assert.equal(row.taskExec, undefined);
  assert.deepEqual(decodeUsage(file).days['2026-07-26'].tasks, {}, 'and it reads back as the empty map it means');
});

test('a version-1 file decodes as itself — the fold reads back weeks it froze earlier', () => {
  const v1 = {
    version: 1,
    foldedThrough: '2026-07-26',
    runsFoldedThrough: '2026-07-26T00:00:00Z',
    days: {},
    weeks: {
      '2026-W30': {
        days: 3, captures: 4, merges: 4, sessionDays: 3, userMessages: 40, userCommands: 1,
        skillLoads: { 'merge-to-main': 3 }, checks: { work: { runs: 9, failures: 2 } }, checkFindings: {},
      },
    },
  };
  const decoded = decodeUsage(v1);
  assert.equal(decoded.weeks['2026-W30'].skillLoads['merge-to-main'], 3);
  // …and the next fold writes it out in the new shape without recounting anything.
  const folded = foldUsage({ files: [fileOf('2026-07-27', 1, 's1', {})], prior: decoded, today: '2026-07-28' });
  const file = encodeUsage(folded);
  assert.equal(file.version, USAGE_VERSION);
  assert.equal(file.weeks['2026-W30'].totals[file.fields.week.indexOf('captures')], 4);
});

test('adding and removing a pack, skill or task is pure key presence', () => {
  // Names are literal keys, never dictionary ids, precisely so this holds: a skill
  // that appears carries a key from the day it appears, one that is retired simply
  // stops having one, and no frozen row anywhere has to be renumbered.
  const before = encodeUsage(foldUsage({
    files: [fileOf('2026-07-26', 1, 's1', { skillLoads: { 'old-skill': 2 } })], prior: {}, today: '2026-07-27',
  }));
  const after = encodeUsage(foldUsage({
    files: [fileOf('2026-07-26', 1, 's1', { skillLoads: { 'new-skill': 1 } })], prior: {}, today: '2026-07-27',
  }));
  assert.deepEqual(Object.keys(before.days['2026-07-26'].skillLoads), ['old-skill']);
  assert.deepEqual(Object.keys(after.days['2026-07-26'].skillLoads), ['new-skill']);
  // The one thing that must NOT move: every other row's encoding is untouched by it.
  assert.deepEqual(before.days['2026-07-26'].totals, after.days['2026-07-26'].totals);
  assert.deepEqual(before.fields, after.fields);
});

test('a counter a row predates stays unknown in the file, never a fabricated zero', () => {
  // A week frozen before a field existed has no key for it. The tuple slot is `null`,
  // and it decodes back to no key — the fold then starts that field from the first day
  // that actually carried it, instead of claiming the week saw zero of them.
  const prior = {
    foldedThrough: '2026-07-26',
    weeks: { '2026-W30': { days: 2, captures: 3, merges: 3, sessionDays: 2, skillLoads: {} } },
    days: {},
  };
  const file = encodeUsage(foldUsage({ files: [], prior, today: '2026-07-27' }));
  const totals = file.weeks['2026-W30'].totals;
  assert.equal(totals[file.fields.week.indexOf('captures')], 3);
  assert.equal(totals[file.fields.week.indexOf('userMessages')], null);
  assert.ok(!('userMessages' in decodeUsage(file).weeks['2026-W30']));
});
