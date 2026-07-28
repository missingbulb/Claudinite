import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUserMessage, commandName, skillToolLoads, countEntries,
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

// --- day folding --------------------------------------------------------------

const fileOf = (date, issue, sessionId, counts = {}) => ({
  date, issue, sessionId,
  counts: { userMessages: 0, userCommands: 0, skillLoads: {}, ...counts },
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
  });
  assert.equal(days['2026-07-27'].merges, 0);
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
  const day = { captures: 2, merges: 1, sessions: 2, userMessages: 10, userCommands: 1, skillLoads: { a: 1 } };
  const week = addDayToWeek(addDayToWeek(undefined, day), day);
  assert.deepEqual(week, {
    days: 2, captures: 4, merges: 2, sessionDays: 4, userMessages: 20, userCommands: 2, skillLoads: { a: 2 },
  });
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
