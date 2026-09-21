import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hookMarks, readMark, countCorpusUse, countMoments, countToolCalls, countCheckTiming, parseTiming, LOAD_CAUSES,
} from '../../../tasks/usage-fold/corpus-use.mjs';
import { renderTiming } from '../../../../../engine/checks/check-timing.mjs';
import { hitsCall, hitsPrompt, hitsPath, globToRegExp } from '../../../../../engine/pack_loader/path-scoped-skills.mjs';

// The entry shapes are the real ones — a hook's stderr reaches the transcript as a
// meta user turn, and every load is a tool_use block.
const hookTurn = (...lines) => ({ type: 'user', isMeta: true, message: { content: lines.join('\n') } });
const assistant = (...blocks) => ({ type: 'assistant', message: { content: blocks } });
const skill = (name) => ({ type: 'tool_use', name: 'Skill', input: { skill: name }, id: `t${name}` });
const call = (name, input) => ({ type: 'tool_use', name, input, id: `t${name}` });
const human = (text) => ({ type: 'user', origin: { kind: 'human' }, message: { content: text } });
const mark = (hook, message, at = '2026-09-21T10:00:00Z', run = '1') => `${at} run=${run} ${hook}: ${message}`;

const causes = (over) => ({ ...Object.fromEntries(LOAD_CAUSES.map((c) => [c, 0])), ...over });

test('hookMarks reads the log lines out of whatever entry shape carried them, once each', () => {
  const line = mark('Stop', 'done exit=0 checks-passed');
  const marks = hookMarks(hookTurn('Stop hook feedback:', line));
  assert.deepEqual(marks, [{ stamp: '2026-09-21T10:00:00Z', run: '1', hook: 'Stop', message: 'done exit=0 checks-passed' }]);
  // One emission the harness recorded twice — the same line, so one mark.
  const seen = new Set();
  assert.equal(hookMarks(hookTurn(line), seen).length, 1);
  assert.equal(hookMarks(hookTurn(line), seen).length, 0, 'the second recording of one emission is not a second mark');
  // …and two real emissions differ by their run id at least.
  assert.equal(hookMarks(hookTurn(mark('Stop', 'done exit=0 checks-passed', '2026-09-21T10:00:00Z', '2')), seen).length, 1);
});

test('readMark classifies the four marks a guard leaves, and nothing else', () => {
  assert.deepEqual(readMark({ hook: 'PreToolUse', message: 'done exit=2 skill-not-loaded packs/a/RULES.md needs writing-pack-prose,changing-pack-elements' }),
    { kind: 'block', cause: 'blockedEdit', skills: ['writing-pack-prose', 'changing-pack-elements'] });
  assert.deepEqual(readMark({ hook: 'PreToolUse', message: 'done exit=2 skill-not-loaded-for-call Bash needs committing' }),
    { kind: 'block', cause: 'blockedCall', skills: ['committing'] });
  assert.deepEqual(readMark({ hook: 'PreToolUse', message: 'done exit=2 action-guard no-pr-polling,ask-already-decided' }),
    { kind: 'guard', severity: 'blocking', rules: ['no-pr-polling', 'ask-already-decided'] });
  assert.deepEqual(readMark({ hook: 'PreToolUse', message: 'advisory action-guard pipe-tail-hides-exit' }),
    { kind: 'guard', severity: 'advisory', rules: ['pipe-tail-hides-exit'] });
  assert.deepEqual(readMark({ hook: 'PostToolUse', message: 'skill-trigger WebFetch fetching-from-the-web' }),
    { kind: 'trigger', cause: 'resultTrigger', skills: ['fetching-from-the-web'] });
  assert.deepEqual(readMark({ hook: 'UserPromptSubmit', message: 'skill-trigger do-later' }),
    { kind: 'trigger', cause: 'promptTrigger', skills: ['do-later'] });
  for (const not of [
    { hook: 'PreToolUse', message: 'done exit=0 allowed' },
    { hook: 'Stop', message: 'done exit=0 checks-passed' },
    { hook: 'PreToolUse', message: 'action-guard-failed some-rule boom' },
  ]) assert.equal(readMark(not), null, `${not.message} is not a corpus mark`);
});

test('a load is attributed to the mark that caused it, and to nothing once that mark is spent', () => {
  const { skillLoadsBy, skillBlocks } = countCorpusUse([
    hookTurn(mark('PreToolUse', 'done exit=2 skill-not-loaded-for-call Bash needs committing', '2026-09-21T10:00:00Z', '1')),
    assistant(skill('committing')),
    // …and a second load of the same skill, with no new mark before it, is the
    // session reaching for it rather than the first block firing twice.
    assistant(skill('committing')),
  ]);
  assert.deepEqual(skillLoadsBy.committing, causes({ blockedCall: 1, voluntary: 1 }));
  assert.deepEqual(skillBlocks, { committing: 1 });
});

test('a load nothing preceded is voluntary, and the way the body arrived names itself', () => {
  const { skillLoadsBy } = countCorpusUse([
    assistant(skill('bug-investigation')),
    assistant(call('Read', { file_path: 'packs/basics/skills/file-placement/SKILL.md' })),
    { type: 'user', message: { content: '<command-name>/merge-to-main</command-name>' } },
    assistant(call('Read', { file_path: 'docs/usage-review/DESIGN.md' })),
  ], new Set(['bug-investigation', 'file-placement', 'merge-to-main']));
  assert.deepEqual(skillLoadsBy['bug-investigation'], causes({ voluntary: 1 }));
  assert.deepEqual(skillLoadsBy['file-placement'], causes({ read: 1 }));
  assert.deepEqual(skillLoadsBy['merge-to-main'], causes({ command: 1 }));
  assert.equal(Object.keys(skillLoadsBy).length, 3, 'a Read of something that is not a mounted skill is not a load');
});

test('a trigger that fired is followed only by a load after it, and an unfollowed fire stays unfollowed', () => {
  const followed = countCorpusUse([
    hookTurn(mark('PostToolUse', 'skill-trigger WebFetch fetching-from-the-web')),
    assistant(skill('fetching-from-the-web')),
  ]).triggerFires;
  assert.deepEqual(followed['fetching-from-the-web'], { fired: 1, followed: 1 });

  const ignored = countCorpusUse([
    hookTurn(mark('PostToolUse', 'skill-trigger WebFetch fetching-from-the-web')),
    assistant(call('Bash', { command: 'echo on with the work' })),
  ]).triggerFires;
  assert.deepEqual(ignored['fetching-from-the-web'], { fired: 1, followed: 0 },
    'the fire nobody acted on is the whole of the unfollowed-trigger rule\'s evidence');

  // A load BEFORE the fire does not follow it — order is what the counter means.
  const before = countCorpusUse([
    assistant(skill('fetching-from-the-web')),
    hookTurn(mark('PostToolUse', 'skill-trigger WebFetch fetching-from-the-web')),
  ]).triggerFires;
  assert.deepEqual(before['fetching-from-the-web'], { fired: 1, followed: 0 });
});

test('guard firings are counted per rule, by what the call was told', () => {
  const { guardFires } = countCorpusUse([
    hookTurn(mark('PreToolUse', 'advisory action-guard pipe-tail-hides-exit', '2026-09-21T10:00:00Z', '1')),
    hookTurn(mark('PreToolUse', 'advisory action-guard pipe-tail-hides-exit', '2026-09-21T10:00:01Z', '2')),
    hookTurn(mark('PreToolUse', 'done exit=2 action-guard no-pr-polling', '2026-09-21T10:00:02Z', '3')),
  ]);
  assert.deepEqual(guardFires, {
    'pipe-tail-hides-exit': { blocking: 0, advisory: 2 },
    'no-pr-polling': { blocking: 1, advisory: 0 },
  });
});

test('countToolCalls counts every call, a subagent\'s included, and names no skill', () => {
  assert.deepEqual(countToolCalls([
    assistant(call('Bash', { command: 'ls' }), call('Bash', { command: 'pwd' })),
    assistant(call('Read', { file_path: 'a.mjs' })),
    human('not a call'),
  ]), { Bash: 2, Read: 1 });
});

test('moments count every occasion a declaration named, loaded or not', () => {
  const declarations = [
    { skill: 'committing', kind: 'toolCall', tool: 'Bash', field: 'command', pattern: /git commit/ },
    { skill: 'do-later', kind: 'prompt', pattern: /\/do-later/ },
    { skill: 'writing-tests', re: globToRegExp('**/*.test.mjs') },
  ];
  const hits = { call: hitsCall, prompt: hitsPrompt, path: hitsPath };
  const entries = [
    assistant(call('Bash', { command: 'git commit -m one' })),
    assistant(skill('committing')),
    // The second commit is still a moment — the denominator is occasions, not
    // occasions the hook would have spoken up for.
    assistant(call('Bash', { command: 'git commit -m two' })),
    human('please /do-later this'),
    assistant(call('Edit', { file_path: 'engine-tests/a.test.mjs' })),
    assistant(call('Edit', { file_path: 'engine/a.mjs' })),
  ];
  assert.deepEqual(countMoments(entries, declarations, hits), { committing: 2, 'do-later': 1, 'writing-tests': 1 });
});

test('moments record NO key where the engine could not resolve the declarations', () => {
  const entries = [assistant(call('Bash', { command: 'git commit -m one' }))];
  const declarations = [{ skill: 'committing', kind: 'toolCall', tool: 'Bash', field: 'command', pattern: /git commit/ }];
  assert.deepEqual(countMoments(entries, declarations, {}), {},
    'an absent predicate is *not recorded*, never zero moments');
  assert.deepEqual(countMoments(entries, declarations, { call: hitsCall }), {}, 'a partial set is no set');
});

test('the timing reader reads what the engine\'s renderer writes — the two lanes ship apart', () => {
  const line = renderTiming('work', 1175, [{ id: 'squash-merge-history', ms: 928 }, { id: 'reference-integrity', ms: 132 }]);
  assert.deepEqual(parseTiming(line), {
    scope: 'work',
    totalMs: 1175,
    rules: [{ id: 'squash-merge-history', ms: 928 }, { id: 'reference-integrity', ms: 132 }],
  });
  assert.equal(parseTiming('0 blocking, 1 advisory (work scope: all).'), null);
});

test('checkTiming keys the sweep and its named rules apart, and a peak is not a sum', () => {
  const timing = countCheckTiming([
    hookTurn(mark('Stop', renderTiming('work', 100, [{ id: 'a-rule', ms: 60 }]), '2026-09-21T10:00:00Z', '1')),
    hookTurn(mark('Stop', renderTiming('work', 300, [{ id: 'a-rule', ms: 40 }]), '2026-09-21T10:00:01Z', '2')),
  ]);
  assert.deepEqual(timing.work, { runs: 2, totalMs: 400, maxMs: 300 });
  assert.deepEqual(timing['work/a-rule'], { runs: 2, totalMs: 100, maxMs: 60 });
});
