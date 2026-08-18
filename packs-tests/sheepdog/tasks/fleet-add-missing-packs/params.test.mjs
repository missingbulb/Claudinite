import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, parseArgv, ALL_MEMBERS } from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/params.mjs';
import { parseParamBag } from '../../../../packs/sheepdog/param-bag.mjs';

// The parameter layer decides WHAT A RUN IS, from two call sites that cannot see each
// other — a command line in task.mjs and the Context lines a hand-created work item
// carries. Everything asserted here is a property whose loss would let one of them mean
// something its author did not type.

const weekly = { argv: ['--scan-for-needed-packs=true', `--repos=${ALL_MEMBERS}`] };

// --- no defaults --------------------------------------------------------------

test('neither parameter has a default — an unsent one fails the run', () => {
  assert.throws(() => parseParams({ argv: ['--repos=Alpha'] }), /scan_for_needed_packs was not sent/);
  assert.throws(() => parseParams({ argv: ['--scan-for-needed-packs=true'] }), /repos was not sent/);
  assert.throws(() => parseParams({}), /was not sent/);
});

test('the weekly call site sends both, and asks for the whole fleet by keyword', () => {
  const p = parseParams(weekly);
  assert.equal(p.scan, true);
  assert.equal(p.allMembers, true);
  assert.equal(p.repos, null);   // never a list a caller could mistake for complete
  assert.deepEqual(p.addPacks, []);
  assert.equal(p.forced, false);
});

test('a boolean is `true` or `false` and nothing else', () => {
  // The misreading this exists to prevent: `SCAN_FOR_NEEDED_PACKS=false` read as "the key
  // is present, therefore on" would turn a targeted force into a fleet-wide sweep.
  assert.equal(parseParams({ argv: ['--repos=Alpha', '--scan-for-needed-packs=false'], params: { ADD_PACKS: 'p' } }).scan, false);
  assert.throws(() => parseParams({ argv: ['--scan-for-needed-packs=yes', '--repos=Alpha'] }), /must be exactly/);
  assert.throws(() => parseParams({ argv: ['--scan-for-needed-packs=1', '--repos=Alpha'] }), /must be exactly/);
});

test('an unrecognised prework argument fails rather than being ignored', () => {
  assert.throws(() => parseArgv(['--repos']), /expected `--<name>=<value>`/);
  assert.throws(() => parseArgv(['-r=x']), /unrecognised prework argument/);
});

// --- Context parameters win ----------------------------------------------------

test('a Context parameter beats the weekly command line — that is what forcing IS', () => {
  const p = parseParams({
    ...weekly,
    params: { SCAN_FOR_NEEDED_PACKS: 'false', REPOS: 'Alpha Beta', ADD_PACKS: 'node' },
  });
  assert.equal(p.scan, false);
  assert.deepEqual(p.repos, ['Alpha', 'Beta']);
  assert.deepEqual(p.addPacks, ['node']);
  assert.equal(p.forced, true);
});

test('an item carrying only prose is not a force — the weekly sweep stays the weekly sweep', () => {
  // Every standing item is born carrying a Context, and a hand-created one gets the
  // generic "created by hand" note when the operator names none. Neither steers the
  // parameters, so neither may make the run report itself as forced.
  const born = parseParamBag('Created by hand — no precondition asserts there is work to do.');
  assert.deepEqual(born, {});
  assert.equal(parseParams({ ...weekly, params: born }).forced, false);
});

test('lists are space-separated, because the parameter bag splits keys on commas', () => {
  // The coupling this pins: param-bag.mjs splits on `,` and `\n`, so a comma inside a
  // value silently becomes a second, unknown KEY.
  const raw = 'REPOS=Alpha Beta\nADD_PACKS=one two';
  assert.deepEqual(parseParamBag(raw).REPOS, 'Alpha Beta');
  const p = parseParams({ argv: ['--scan-for-needed-packs=true'], params: parseParamBag(raw) });
  assert.deepEqual(p.repos, ['Alpha', 'Beta']);
  assert.deepEqual(p.addPacks, ['one', 'two']);
});

// --- the guards ---------------------------------------------------------------

test('a force must name its repos — the fleet keyword is refused', () => {
  // A scan over the whole fleet only SUSPECTS, and every suspicion is reviewed on its
  // issue. A force writes a decision, so its blast radius is the list a human typed.
  assert.throws(
    () => parseParams({ argv: ['--scan-for-needed-packs=false', `--repos=${ALL_MEMBERS}`], params: { ADD_PACKS: 'node' } }),
    /refused/,
  );
});

test('a run that would do nothing is refused rather than reported as clean', () => {
  assert.throws(() => parseParams({ argv: ['--scan-for-needed-packs=false', '--repos=Alpha'] }), /would do nothing/);
});

test('the fleet keyword cannot be mixed with names', () => {
  assert.throws(() => parseParams({ argv: ['--scan-for-needed-packs=true', `--repos=Alpha ${ALL_MEMBERS}`] }), /one or the other/);
});

test('config and answers for a pack nobody is adding are an error, not dead weight', () => {
  assert.throws(
    () => parseParams({ ...weekly, params: { REPOS: 'Alpha', ADD_PACKS: 'node', PACK_CONFIG: 'firebase.repo=o/r' } }),
    /not in ADD_PACKS/,
  );
});

// --- config and answers -------------------------------------------------------

test('config and answers fold per pack, with dotted keys nesting', () => {
  const p = parseParams({
    argv: ['--scan-for-needed-packs=false', '--repos=Alpha'],
    params: {
      ADD_PACKS: 'store-pack',
      PACK_CONFIG: 'store-pack.repo=owner/Store',
      PACK_CONFIG_2: 'store-pack.nested.path=preferences',
      PACK_ANSWER: 'store-pack.store=owner/Store — where the files live',
    },
  });
  assert.deepEqual(p.packConfig, { 'store-pack': { repo: 'owner/Store', nested: { path: 'preferences' } } });
  assert.deepEqual(p.packAnswers, { 'store-pack': { store: 'owner/Store — where the files live' } });
});

test('two entries colliding on one key is an error, not a last-one-wins', () => {
  // A run whose config depends on which entry was applied last is one nobody can predict
  // from the button that started it.
  assert.throws(() => parseParams({
    argv: ['--scan-for-needed-packs=false', '--repos=Alpha'],
    params: { ADD_PACKS: 'p', PACK_CONFIG: 'p.repo=a/b', PACK_CONFIG_2: 'p.repo=c/d' },
  }), /conflict/);
});

test('a malformed entry names the shape it wanted', () => {
  const bad = (overrides) => () => parseParams({ argv: ['--scan-for-needed-packs=false', '--repos=Alpha'], params: { ADD_PACKS: 'p', ...overrides } });
  assert.throws(bad({ PACK_CONFIG: 'p.repo' }), /<pack-id>\.<key>=<value>/);
  assert.throws(bad({ PACK_CONFIG: 'repo=a/b' }), /names no pack/);
  assert.throws(bad({ PACK_ANSWER: 'p.store=' }), /empty value/);
});
