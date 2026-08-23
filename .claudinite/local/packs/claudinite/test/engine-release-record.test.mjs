import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import rule, { declaredVersion, releaseRowFor, RELEASES } from '../workRules/engine-release-record.mjs';

const VERSION_FILE = 'engine/version.mjs';
const versionSrc = (n) => `// preamble\nexport const ENGINE_VERSION = ${n};\n`;
const RUN = 'https://github.com/missingbulb/Claudinite/actions/runs/31628381215';
const row = (n, link = RUN) => `| ${n} | 2026-08-13 | [rehearsal](${link}) | what changed |`;
const log = (...rows) => `# Engine releases\n\n| Version | Date | Canary | Summary |\n|---|---|---|---|\n${rows.join('\n')}\n`;

const work = (changedFiles, files = {}, base = {}) => ({
  changedFiles,
  read: (f) => files[f] ?? null,
  readBase: (f) => base[f] ?? null,
});

test('declaredVersion reads the constant, and says nothing when there is none', () => {
  assert.equal(declaredVersion(versionSrc(7)), 7);
  assert.equal(declaredVersion('export const ENGINE_VERSION = 12 ;\n'), 12);
  assert.equal(declaredVersion('export const SOMETHING_ELSE = 3;\n'), null);
  assert.equal(declaredVersion(null), null);
});

test('releaseRowFor distinguishes no row, a row without evidence, and a cited one', () => {
  assert.equal(releaseRowFor(log(row(2)), 2), 'ok');
  assert.equal(releaseRowFor(log(row(2)), 3), 'missing');
  assert.equal(releaseRowFor(log('| 3 | 2026-08-13 | pending | what changed |'), 3), 'no-run');
  assert.equal(releaseRowFor(null, 2), 'missing');
  // The header row's first cell is a word, not a number — it never answers for a version.
  assert.equal(releaseRowFor(log(row(2)), 0), 'missing');
});

test('a bump with a cited row passes', () => {
  const w = work([VERSION_FILE, RELEASES],
    { [VERSION_FILE]: versionSrc(2), [RELEASES]: log(row(2), RUN) },
    { [VERSION_FILE]: versionSrc(1), [RELEASES]: log() });
  assert.deepEqual(rule.run(w), []);
});

test('a bump with no row, or a row citing nothing, is blocking', () => {
  const noRow = rule.run(work([VERSION_FILE],
    { [VERSION_FILE]: versionSrc(2), [RELEASES]: log(row(1)) },
    { [VERSION_FILE]: versionSrc(1) }));
  assert.equal(noRow.length, 1);
  assert.match(noRow[0].what, /releases engine version 2, and engine\/RELEASES\.md carries no row/);

  const noRun = rule.run(work([VERSION_FILE],
    { [VERSION_FILE]: versionSrc(2), [RELEASES]: log('| 2 | 2026-08-13 | not yet | x |') },
    { [VERSION_FILE]: versionSrc(1) }));
  assert.equal(noRun.length, 1);
  assert.match(noRun[0].what, /cites no canary rehearsal run/);
});

test('a version that moves backwards is refused on its own terms', () => {
  const f = rule.run(work([VERSION_FILE],
    { [VERSION_FILE]: versionSrc(1), [RELEASES]: log(row(1)) },
    { [VERSION_FILE]: versionSrc(4) }));
  assert.equal(f.length, 1);
  assert.match(f[0].what, /moves backwards, 4 → 1/);
});

test('editing version.mjs without moving the version is an ordinary engine edit', () => {
  // The comment above the constant is where the release discipline is written down;
  // rewording it must not demand a release.
  const w = work([VERSION_FILE],
    { [VERSION_FILE]: `// reworded\nexport const ENGINE_VERSION = 1;\n` },
    { [VERSION_FILE]: versionSrc(1) });
  assert.deepEqual(rule.run(w), []);
});

test('a change that does not touch the version file says nothing', () => {
  assert.deepEqual(rule.run(work(['packs/basics/RULES.md'])), []);
  assert.deepEqual(rule.run(work([])), []);
});

test('the live log answers for the version the canon actually ships', () => {
  // The fixtures above prove the matching; this proves the SELECTION — that the
  // real RELEASES.md and the real ENGINE_VERSION agree, which is the pair every
  // member is stamped from. A log whose newest row is not the shipping version is
  // the drift the rule exists to prevent, and no fixture would ever notice.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const version = declaredVersion(readFileSync(join(root, VERSION_FILE), 'utf8'));
  const state = releaseRowFor(readFileSync(join(root, RELEASES), 'utf8'), version);
  assert.notEqual(state, 'missing', `${RELEASES} carries no row for the shipping engine version ${version}`);
});
