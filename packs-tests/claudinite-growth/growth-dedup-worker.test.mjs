import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_ADDED_LINES_PER_FILE,
  MAX_BRIEF_BYTES,
  canonPackOf,
  addedLines,
  addedCheckIds,
  summarizeCanonWindow,
  renderBrief,
  handoffDetail,
} from '../../packs/claudinite-growth/tasks/growth-dedup/worker.mjs';

// The growth-dedup code_work: what the mounted canon ADDED in the window, which is
// the only thing that can newly cover a local item. Pure functions over the
// commit records the API returns, so the whole detection tests with no live
// GitHub; main() is the thin I/O shell around them.

// --- which files belong to a canon pack --------------------------------------

test('canonPackOf: both mount roots, and never a local pack', () => {
  // Two-root form: a member mounts the canon at `.claudinite/shared/packs/`, and
  // the canon home runs the same code from its repo root, where the shared packs
  // ARE `packs/`. A mount-only match is blind in exactly the repo whose canon
  // moves every day.
  assert.equal(canonPackOf('.claudinite/shared/packs/basics/RULES.md'), 'basics');
  assert.equal(canonPackOf('packs/basics/RULES.md'), 'basics');
  // A LOCAL pack is what this task prunes — never the yardstick it prunes against.
  assert.equal(canonPackOf('.claudinite/local/packs/mine/RULES.md'), null);
  assert.equal(canonPackOf('.claudinite/local_packs/mine/RULES.md'), null);
  assert.equal(canonPackOf('src/app.js'), null);
  assert.equal(canonPackOf('packs/basics'), null); // a pack directory is not a file in it
});

// --- reading a patch ----------------------------------------------------------

const PATCH = [
  '@@ -3,6 +3,8 @@',
  ' context line',
  '-a rule the canon dropped',
  '+a rule the canon added',
  '+another added rule',
  ' more context',
].join('\n');

test('addedLines: the + lines only, without the marker, and never the +++ header', () => {
  assert.deepEqual(addedLines(PATCH), ['a rule the canon added', 'another added rule']);
  assert.deepEqual(addedLines('+++ b/packs/x/RULES.md\n+real line'), ['real line']);
  assert.deepEqual(addedLines(undefined), []);
});

test('addedCheckIds: a declared-checks.json patch yields the ids it ADDED', () => {
  // The half a prose-only read misses entirely: a canon check enforces a rule on
  // every session and CI pass, which is stronger coverage than a stated line.
  // The key is `id` — the spelling declared-checks.json actually uses. Read off
  // packs/basics/declared-checks.json rather than guessed: keyed on anything else
  // this returns nothing on every real patch while every fixture stays green.
  const patch = [
    '@@ -10,6 +10,12 @@',
    '+    "id": "pack-entry-await",',
    '+    "severity": "blocking",',
    '+    "id": "rules-line-length",',
    '-    "id": "retired-thing",',
  ].join('\n');
  assert.deepEqual(addedCheckIds(patch), ['pack-entry-await', 'rules-line-length']);
});

test('addedCheckIds: the key is the one the real canon file uses', () => {
  // Drift guard against the shape this parse is stated over. A rename in the
  // declared-checks vocabulary must fail here rather than silently retire the
  // new-check half of every dedup brief.
  const real = readFileSync(new URL('../../packs/basics/declared-checks.json', import.meta.url), 'utf8');
  const declared = JSON.parse(real).map((c) => c.id);
  const parsed = addedCheckIds(real.split('\n').map((l) => `+${l}`).join('\n'));
  assert.ok(declared.length >= 3, `the fixture pack declares only ${declared.length} checks — pick a richer one`);
  // Every id the file declares, and only those: keyed on the wrong word this is
  // empty on every real patch, and fixtures alone would never say so.
  assert.deepEqual(parsed.sort(), declared.sort());
});

// --- the window summary -------------------------------------------------------

const commit = (sha, files) => ({ sha, message: `commit ${sha}`, files });

test('summarizeCanonWindow: declared canon packs only, files merged across commits', () => {
  const commits = [
    commit('a', [
      { filename: '.claudinite/shared/packs/basics/RULES.md', patch: PATCH },
      { filename: '.claudinite/shared/packs/product-wiki/RULES.md', patch: PATCH },
      { filename: 'src/app.js', patch: PATCH },
    ]),
    commit('b', [
      { filename: '.claudinite/shared/packs/basics/RULES.md', patch: '@@\n+a third added rule' },
      { filename: '.claudinite/shared/packs/basics/declared-checks.json', patch: '@@\n+  { "id": "new-check", "severity": "advisory" }' },
    ]),
  ];
  const summary = summarizeCanonWindow(commits, ['basics', 'claudinite-lifecycle']);

  assert.deepEqual(Object.keys(summary.packs), ['basics']); // product-wiki undeclared, src/ not canon
  const files = summary.packs.basics.files;
  assert.deepEqual(Object.keys(files).sort(), [
    '.claudinite/shared/packs/basics/RULES.md',
    '.claudinite/shared/packs/basics/declared-checks.json',
  ].sort());
  // The same file moving twice contributes both commits' additions, in order.
  assert.deepEqual(files['.claudinite/shared/packs/basics/RULES.md'].added, [
    'a rule the canon added', 'another added rule', 'a third added rule',
  ]);
  assert.deepEqual(summary.packs.basics.newCheckIds, ['new-check']);
  assert.equal(summary.addedLineCount, 4);
  assert.equal(summary.fileCount, 2);
});

test('summarizeCanonWindow: a file the API gave no patch for is reported, not dropped', () => {
  // GitHub omits `patch` on a very large diff. Silently dropping the file would
  // tell the run the canon did not move there — the one lie this brief must not
  // tell.
  const summary = summarizeCanonWindow(
    [commit('a', [{ filename: 'packs/basics/RULES.md' }])],
    ['basics'],
  );
  assert.equal(summary.packs.basics.files['packs/basics/RULES.md'].patchUnavailable, true);
  assert.match(renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' }), /read the file whole/);
});

test('summarizeCanonWindow: an empty window summarizes to nothing, not to a crash', () => {
  const summary = summarizeCanonWindow([], ['basics']);
  assert.deepEqual(summary.packs, {});
  assert.equal(summary.addedLineCount, 0);
  assert.match(renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' }), /No declared canon pack moved/);
});

// --- the brief ----------------------------------------------------------------

test('renderBrief: the added lines and new check ids, under the window it covers', () => {
  const summary = summarizeCanonWindow([
    commit('a', [
      { filename: 'packs/basics/RULES.md', patch: PATCH },
      { filename: 'packs/basics/declared-checks.json', patch: '@@\n+  { "id": "new-check", "severity": "advisory" }' },
    ]),
  ], ['basics']);
  const brief = renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' });

  assert.match(brief, /2026-08-09/);
  assert.match(brief, /packs\/basics\/RULES\.md/);
  assert.match(brief, /a rule the canon added/);
  assert.match(brief, /new-check/);
  // A line the canon REMOVED can never justify a prune, so it is not offered as
  // coverage — the brief carries additions only.
  assert.doesNotMatch(brief, /a rule the canon dropped/);
});

test('renderBrief: a heavy file is truncated with the remainder COUNTED, never silently', () => {
  const many = ['@@', ...Array.from({ length: MAX_ADDED_LINES_PER_FILE + 7 }, (_, i) => `+line ${i}`)].join('\n');
  const summary = summarizeCanonWindow([commit('a', [{ filename: 'packs/basics/RULES.md', patch: many }])], ['basics']);
  const brief = renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' });

  assert.match(brief, /line 0/);
  assert.doesNotMatch(brief, /line 46/); // past the cap
  assert.match(brief, /7 more added line/); // the drop is stated, so the brief is not read as complete
});

test('renderBrief: a heavy window fits the issue body, names every file, and counts what it dropped', () => {
  // The canon home's own last week: 138 changed files and 12k added lines
  // rendered a 350KB body against GitHub's 64KB issue limit — the write would
  // have 422'd and the run failed on its first step. Every changed file is still
  // NAMED (that list is cheap and is the run's map); the additions are what the
  // budget rations, and the rationing is stated.
  const files = Array.from({ length: 200 }, (_, i) => ({
    filename: `packs/basics/rules-${i}.md`,
    patch: ['@@', ...Array.from({ length: 30 }, (_, j) => `+pack basics rule ${i}.${j} — a long enough line to make the budget bite`)].join('\n'),
  }));
  const summary = summarizeCanonWindow([commit('a', files)], ['basics']);
  const brief = renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' });

  assert.ok(brief.length <= MAX_BRIEF_BYTES, `brief is ${brief.length} bytes, over the ${MAX_BRIEF_BYTES} budget`);
  assert.match(brief, /rules-0\.md/);
  assert.match(brief, /rules-199\.md/); // the last file is still on the map
  assert.match(brief, /additions for \d+ further file/); // and the omission is counted, not silent
});

test('renderBrief: even an absurd window renders a body an issue can hold', () => {
  // The map tier is unbudgeted so the run always knows where to look; the last
  // guard is a stated cut, because a 422 on the issue write fails the run at its
  // very first step.
  const files = Array.from({ length: 4000 }, (_, i) => ({
    filename: `packs/basics/a-fairly-long-rule-file-name-number-${i}.md`,
    patch: '@@\n+one added line',
  }));
  const brief = renderBrief(summarizeCanonWindow([commit('a', files)], ['basics']), { sinceIso: '2026-08-09T00:00:00Z' });
  assert.ok(brief.length <= MAX_BRIEF_BYTES + 200, `brief is ${brief.length} bytes`);
  assert.match(brief, /Truncated at/);
});

// --- the hand-off -------------------------------------------------------------

test('handoffDetail: names what the window held, including when it held nothing', () => {
  // The agent runs either way — the precondition already decided the run happens,
  // and an empty canon window still leaves fresh LOCAL items to re-check. So this
  // describes the window; it never re-decides the run.
  const full = summarizeCanonWindow([commit('a', [
    { filename: 'packs/basics/RULES.md', patch: PATCH },
    { filename: 'packs/basics/declared-checks.json', patch: '@@\n+  { "id": "new-check", "severity": "advisory" }' },
  ])], ['basics']);
  assert.match(handoffDetail(full), /basics/);
  assert.match(handoffDetail(full), /1 new check/);
  assert.match(handoffDetail(summarizeCanonWindow([], ['basics'])), /no canon pack moved/i);
});
