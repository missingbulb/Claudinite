import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { removeTree } from '../../../engine/remove-tree.mjs';
import { main, resolvePack, allPacks, overlayIo, changedElements, referenceDateOf } from '../provenance.mjs';
import * as provenance from '../../../engine/checks/helpers/provenance.mjs';

const { checkoutIo, parseEntries } = provenance;

// The command line over the engine helper: pack resolution under both roots, the dry
// run that writes nothing, the append that validates and refuses a secret, and the
// git-backed parts (`--changed`, the conversion's dates, `history`).

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-prov-cli-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'seed (#7)');
  return root;
};
const capture = async (argv, root, stdin = null) => {
  let out = '';
  let err = '';
  const { log, error } = console;
  console.log = (...a) => { out += `${a.join(' ')}\n`; };
  console.error = (...a) => { err += `${a.join(' ')}\n`; };
  try { return { code: await main(argv, { root, stdin }), out, err }; } finally { console.log = log; console.error = error; }
};

const BORN = '## 2026-07-18 · born · from an incident (#12)\n- **Reason:** it failed twice.\n- **Actor:** @x (owner).\n- **Mechanism:** prose.\n';
const FILES = {
  'packs/alpha/pack.mjs': 'export default {};\n',
  'packs/alpha/RULES.md': '- **Doing a thing** — the settled way. (doing-thing)\n\n- **Doing another** — plainly. (3)\n',
  'packs/alpha/references.md': '- **(RULES-3)** Plainly is what the incident taught. Retire when it stops mattering.\n',
  'packs/alpha/provenance/doing-thing.md': BORN,
  'packs/alpha/provenance/_pack.md': '',
  'packs/alpha/README.md': '# alpha\n\nUse it so. It was split from beta until #99 folded it back.\n',
  '.claudinite/local/packs/mine/pack.mjs': 'export default {};\n',
  '.claudinite/local/packs/mine/RULES.md': '- **Local rule** — here.\n',
};

test('resolvePack finds a pack under either root by id or by path; allPacks lists both roots', () => {
  const root = repo(FILES);
  try {
    assert.equal(resolvePack(root, 'alpha'), 'packs/alpha');
    assert.equal(resolvePack(root, 'mine'), '.claudinite/local/packs/mine');
    assert.equal(resolvePack(root, 'packs/alpha/'), 'packs/alpha');
    assert.equal(resolvePack(root, 'nope'), null);
    assert.deepEqual(allPacks(checkoutIo(root)), ['packs/alpha', '.claudinite/local/packs/mine']);
  } finally { removeTree(root); }
});

test('mark --dry-run reports the whole pass and the empty-file count, and writes nothing', async () => {
  const root = repo(FILES);
  try {
    const { code, out } = await capture(['mark', 'mine', '--dry-run'], root);
    assert.equal(code, 0);
    assert.match(out, /"Local rule" marked \(local-rule\)/);
    assert.match(out, /2 empty provenance files under \.claudinite\/local\/packs\/mine \(dry run: nothing written\)/);
    assert.equal(readFileSync(join(root, '.claudinite/local/packs/mine/RULES.md'), 'utf8'), FILES['.claudinite/local/packs/mine/RULES.md']);
    assert.ok(!existsSync(join(root, '.claudinite/local/packs/mine/provenance')));
    const real = await capture(['mark', 'mine'], root);
    assert.equal(real.code, 0);
    assert.ok(existsSync(join(root, '.claudinite/local/packs/mine/provenance/local-rule.md')));
  } finally { removeTree(root); }
});

test('overlayIo lists what was written beside what is on disk, and hides what was removed', () => {
  const root = repo(FILES);
  try {
    const io = overlayIo(checkoutIo(root));
    io.write('packs/alpha/provenance/new-one.md', '');
    io.remove('packs/alpha/references.md');
    assert.ok(io.listDir('packs/alpha/provenance').includes('new-one.md'));
    assert.ok(io.listDir('packs/alpha/provenance').includes('doing-thing.md'));
    assert.ok(!io.listDir('packs/alpha').includes('references.md'));
    assert.equal(io.exists('packs/alpha/references.md'), false);
    assert.equal(io.listDir('packs/alpha/provenance/new-one.md'), null, 'a written file is not a directory');
    assert.deepEqual(io.listDir('packs/nowhere'), null);
    assert.ok(existsSync(join(root, 'packs/alpha/references.md')), 'the disk is untouched');
  } finally { removeTree(root); }
});

test('check prints what each file is named by and exits 1 on a fault, 0 on pending history alone', async () => {
  const root = repo(FILES);
  try {
    const faulty = await capture(['check', 'alpha'], root);
    assert.equal(faulty.code, 1);
    assert.match(faulty.out, /doing-thing\.md ← rule "Doing a thing"/);
    assert.match(faulty.out, /_pack\.md ← the manifest \(empty\)/);
    assert.match(faulty.out, /"Doing another" ends with no marker/);
    assert.match(faulty.out, /references\.md still exists/);
    await capture(['convert-references', 'alpha'], root);
    const clean = await capture(['check', 'alpha'], root);
    assert.equal(clean.code, 0, clean.out);
  } finally { removeTree(root); }
});

test('convert-references dates an entry by the commit that added its key', async () => {
  const root = repo(FILES);
  try {
    const date = git(root, 'log', '-1', '--format=%as').trim();
    assert.equal(referenceDateOf(root, 'packs/alpha/references.md')('RULES-3'), date);
    assert.equal(referenceDateOf(root, 'packs/alpha/references.md')('RULES-9'), null);
    const { code, out } = await capture(['convert-references', 'alpha'], root);
    assert.equal(code, 0);
    assert.match(out, /references\.md: converted and deleted/);
    const text = readFileSync(join(root, 'packs/alpha/provenance/doing-another.md'), 'utf8');
    assert.match(text, new RegExp(`^## ${date} · born · converted from references\\.md \\(RULES-3\\)\\n`));
    assert.ok(!/dated by the conversion/.test(text));
  } finally { removeTree(root); }
});

test('append validates the entry from stdin, refuses a secret whole, and --changed finds the elements the working tree touched', async () => {
  const root = repo(FILES);
  try {
    const entry = '## 2026-08-01 · reworded · said better (#40)\n- **Actor:** @x (owner).\n- **Landed:** #40\n';
    const ok = await capture(['append', 'alpha', 'doing-thing'], root, entry);
    assert.equal(ok.code, 0, ok.err);
    const { entries, errors } = parseEntries(readFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), 'utf8'));
    assert.deepEqual(errors, []);
    assert.deepEqual(entries.map((e) => e.kind), ['born', 'reworded']);

    const bad = await capture(['append', 'alpha', 'doing-thing'], root, '## 2026-01-01 · reworded · earlier\n- **Actor:** @x (owner).\n');
    assert.equal(bad.code, 1);
    assert.match(bad.err, /appended in date order/);
    const secret = await capture(['append', 'alpha', 'doing-thing'], root, '## 2026-09-01 · reworded · with a token ghp_abcdefghijklmnopqrstuvwxyz0123\n- **Actor:** @x (owner).\n');
    assert.equal(secret.code, 1);
    assert.match(secret.err, /reads as a secret/);
    const missing = await capture(['append', 'alpha', 'no-such-element'], root, entry);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /does not exist/);

    const declined = await capture(['append', 'alpha', '_declined'], root, '## 2026-09-01 · declined · a candidate\n- **Reason:** restated the canon.\n- **Actor:** @x (owner).\n');
    assert.equal(declined.code, 0, declined.err);
    assert.match(readFileSync(join(root, 'packs/alpha/provenance/_declined.md'), 'utf8'), /· declined · a candidate/);

    writeFileSync(join(root, 'packs/alpha/RULES.md'), '- **Doing a thing** — the settled way, said better. (doing-thing)\n\n- **Doing another** — plainly. (3)\n');
    writeFileSync(join(root, 'packs/alpha/pack.mjs'), 'export default { version: 2 };\n');
    assert.deepEqual(changedElements(root, 'packs/alpha'), ['_pack', 'doing-thing']);
    const onEmpty = await capture(['append', 'alpha', '--changed'], root, '## 2026-09-02 · reworded · the sweep (#50)\n- **Actor:** @x (owner).\n');
    assert.equal(onEmpty.code, 1);
    assert.match(onEmpty.err, /_pack\.md: the first entry of a file is born/, 'a sweep entry never opens an empty file — its born is the backfill\'s');
    writeFileSync(join(root, 'packs/alpha/provenance/_pack.md'), BORN);
    const swept = await capture(['append', 'alpha', '--changed'], root, '## 2026-09-02 · reworded · the sweep (#50)\n- **Actor:** @x (owner).\n');
    assert.equal(swept.code, 0, swept.err);
    assert.match(swept.out, /_pack\.md: appended/);
    assert.match(swept.out, /doing-thing\.md: appended/);
    assert.deepEqual(parseEntries(readFileSync(join(root, 'packs/alpha/provenance/_pack.md'), 'utf8')).entries.map((e) => e.kind), ['born', 'reworded']);
  } finally { removeTree(root); }
});

test('history prints the commits, the pull requests they name, and the README sentences that read as history', async () => {
  const root = repo(FILES);
  try {
    const { code, out } = await capture(['history', 'alpha', 'doing-thing'], root);
    assert.equal(code, 0);
    assert.match(out, /## commits touching packs\/alpha\/RULES\.md/);
    assert.match(out, /seed \(#7\)/);
    assert.match(out, /## pull requests those commits name\n#7/);
    assert.match(out, /- It was split from beta until #99 folded it back\./);
    const none = await capture(['history', 'alpha', 'nothing-here'], root);
    assert.match(none.out, /named by no carrier/);
  } finally { removeTree(root); }
});

test('reduce prints the reduced file; an unknown command prints the usage and exits 2', async () => {
  const root = repo({ ...FILES, 'packs/alpha/provenance/doing-thing.md': BORN.replace('@x (owner)', '@x (owner) on owner/repo#3 in session_0123456789abcdef') });
  try {
    let printed = '';
    const write = process.stdout.write;
    process.stdout.write = (s) => { printed += s; return true; };
    try { assert.equal(await main(['reduce', 'packs/alpha/provenance/doing-thing.md', '--public'], { root }), 0); } finally { process.stdout.write = write; }
    assert.match(printed, /the owner on a member repository in a session/);
    const usage = await capture(['frobnicate'], root);
    assert.equal(usage.code, 2);
    assert.match(usage.err, /usage: provenance\.mjs/);
  } finally { removeTree(root); }
});

// The backfill's brief and its apply: a rule's events are read from the carrier's own
// history (born where it first appears, reworded where its text changed), a commit that
// touched many packs is a sweep - listed, never drafted onto an element - and apply
// appends every drafted entry once, refusing the whole brief on one bad entry.
const commitAs = (root, message, { email = 't@t' } = {}) => {
  git(root, 'add', '-A');
  execFileSync('git', ['-c', `user.email=${email}`, '-c', 'user.name=t', 'commit', '-q', '-m', message], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
};
const briefRepo = () => {
  const root = repo({
    ...FILES,
    'packs/alpha/provenance/doing-thing.md': '',
    'packs/alpha/provenance/doing-another.md': '',
    'packs/alpha/pack.mjs': '// alpha: the pack for doing things.\n//\n// No fingerprint: a thing is declared.\n\nexport default {\n  version: 2,\n};\n',
    'packs/alpha/RULES.md': '- **Doing a thing** — the settled way. (doing-thing)\n\n- **Doing another** — plainly. (doing-another)\n',
    'packs/alpha/VERSIONS.md': '| Version | Date | What changed |\n|---|---|---|\n| 2 | 2026-08-02 | Said better (#8) |\n| 1 | 2026-07-01 | seed (#7) |\n',
  });
  writeFileSync(join(root, 'packs/alpha/RULES.md'), '- **Doing a thing** — the settled way, said better. (doing-thing)\n\n- **Doing another** — plainly. (doing-another)\n');
  commitAs(root, 'Said better (#8)\n\nThe old wording hid the point.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\nClaude-Session: https://example.invalid/s', { email: '1+tester@users.noreply.github.com' });
  for (const p of ['beta', 'gamma', 'delta', 'epsilon']) {
    mkdirSync(join(root, `packs/${p}`), { recursive: true });
    writeFileSync(join(root, `packs/${p}/RULES.md`), '- **Elsewhere** — so.\n');
  }
  writeFileSync(join(root, 'packs/alpha/RULES.md'), '- **Doing a thing** - the settled way, said better. (doing-thing)\n\n- **Doing another** - plainly. (doing-another)\n\n- **Born in a sweep** - so. (born-in-sweep)\n');
  writeFileSync(join(root, 'packs/alpha/provenance/born-in-sweep.md'), '');
  commitAs(root, 'Hyphens everywhere (#9)');
  mkdirSync(join(root, 'packs/alpha/skills/doing-it'), { recursive: true });
  writeFileSync(join(root, 'packs/alpha/skills/doing-it/SKILL.md'), '---\nname: doing-it\ndescription: Do it. Use when doing it.\nmetadata:\n  body: workflow\n---\n\n1. Do it.\n');
  writeFileSync(join(root, 'packs/alpha/provenance/doing-it.md'), '');
  commitAs(root, 'A skill for doing it (#10)');
  writeFileSync(join(root, 'packs/alpha/pack.mjs'), '// alpha: the pack for doing things.\n//\n// No fingerprint: a thing is declared.\n\nexport default {\n  version: 3,\n};\n');
  commitAs(root, 'Bump pack versions: alpha 3 (#11)');
  writeFileSync(join(root, 'packs/alpha/pack.mjs'), '// alpha: the pack for doing things.\n//\n// No fingerprint: a thing is declared.\n\nexport default {\n  version: 3,\n  hidden: true,\n};\n');
  commitAs(root, 'Hide alpha (#12)');
  return root;
};

test('brief reads each element\'s events from its carrier\'s history, sets a sweep aside, and drafts entries from the commit', async () => {
  const root = briefRepo();
  try {
    const { code, out } = await capture(['brief', 'alpha'], root);
    assert.equal(code, 0);
    assert.match(out, /5 empty files · 4 pack-local commits · 1 sweep/);
    assert.match(out, /```entry born-in-sweep\n## 2026-\d{2}-\d{2} · born · Hyphens everywhere \(#9\)/, 'the element a sweep bore is born there all the same');
    assert.match(out, /## sweeps[\s\S]*#9/, 'the five-pack commit is a sweep');
    assert.doesNotMatch(out, /```entry doing-thing\n## \d{4}-\d{2}-\d{2} · reworded · Hyphens/, 'a sweep is never drafted onto an element');
    assert.match(out, /```entry doing-thing\n## 2026-\d{2}-\d{2} · born · seed \(#7\)/);
    assert.match(out, /```entry-defaults\n- \*\*Actor:\*\* @tester\.\n- \*\*Model:\*\* Claude Opus 5, per the commit trailer\.\n- \*\*Landed:\*\* #8 · pack version 2\.\n```\n```entry doing-thing\n## 2026-\d{2}-\d{2} · reworded · Said better \(#8\)\n```/, 'the commit\'s shared fields are written once, ahead of its entries');
    assert.doesNotMatch(out, /## PR #11/, 'a commit that only bumped the version is no event');
    assert.match(out, /```entry doing-another\n## 2026-\d{2}-\d{2} · born · seed \(#7\)[\s\S]*?- \*\*Mechanism:\*\* a RULES\.md rule, triggered on "Doing another"/);
    assert.doesNotMatch(out, /```entry doing-another\n## [^\n]* · reworded/, 'a rule whose text never changed has one event');
    assert.match(out, /```entry doing-it\n## 2026-\d{2}-\d{2} · born · A skill for doing it \(#10\)/);
    assert.match(out, /## PR #8 · [^\n]*Said better[\s\S]*?> The old wording hid the point\./, 'the body is quoted once, under its pull request');
    assert.doesNotMatch(out, /Claude-Session/, 'trailers are stripped');
    assert.match(out, /- It was split from beta until #99 folded it back\./);
    assert.match(out, /## the manifest, packs\/alpha\/pack\.mjs\n[^\n]*\n> alpha: the pack for doing things\.\n>\n> No fingerprint: a thing is declared\.\n- #12 \d{4}-\d{2}-\d{2} Hide alpha\n/, 'the header comment is quoted and the manifest\'s later commits are listed, the bump left out');
    assert.match(out, /```entry _pack\n## 2026-\d{2}-\d{2} · born · seed \(#7\)/);
    assert.doesNotMatch(out, /```entry _pack\n## [^\n]* · reworded/, '_pack drafts its birth only');
  } finally { removeTree(root); }
});

test('apply appends every drafted entry once, refuses the whole brief on one bad entry, and a second apply writes nothing', async () => {
  const root = briefRepo();
  try {
    const brief = (await capture(['brief', 'alpha'], root)).out;
    const path = join(root, 'brief.md');
    writeFileSync(path, brief);
    const first = await capture(['apply', 'alpha', path], root);
    assert.equal(first.code, 0, first.err);
    const thing = parseEntries(readFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), 'utf8'));
    assert.deepEqual(thing.errors, []);
    assert.deepEqual(thing.entries.map((e) => e.kind), ['born', 'reworded']);
    assert.deepEqual(thing.entries[1].fields, { Actor: '@tester.', Model: 'Claude Opus 5, per the commit trailer.', Landed: '#8 · pack version 2.' }, 'the defaults fence lands under the entry');
    assert.deepEqual(thing.entries[1].order, ['Actor', 'Model', 'Landed']);
    assert.deepEqual(parseEntries(readFileSync(join(root, 'packs/alpha/provenance/doing-it.md'), 'utf8')).entries.map((e) => e.kind), ['born']);

    const again = await capture(['apply', 'alpha', path], root);
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /nothing to append/);
    assert.deepEqual(parseEntries(readFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), 'utf8')).entries.map((e) => e.kind), ['born', 'reworded']);

    writeFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), '');
    writeFileSync(join(root, 'packs/alpha/provenance/doing-another.md'), '');
    writeFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), '');
    writeFileSync(join(root, 'packs/alpha/provenance/doing-another.md'), '');
    writeFileSync(path, brief.replace(/```entry-defaults\n- \*\*Actor:\*\* @tester\.\n/, '```entry-defaults\n- **Actor:** @tester.\n- **Reason:** shared.\n'));
    const merged = await capture(['apply', 'alpha', path], root);
    assert.equal(merged.code, 0, merged.err);
    assert.equal(parseEntries(readFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), 'utf8')).entries[1].fields.Reason, 'shared.', 'a field added to the defaults reaches every entry under them');
    assert.equal(parseEntries(readFileSync(join(root, 'packs/alpha/provenance/doing-another.md'), 'utf8')).entries[0].fields.Reason, undefined, 'an entry under another commit\'s defaults is untouched');

    writeFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), '');
    writeFileSync(join(root, 'packs/alpha/provenance/doing-another.md'), '');
    writeFileSync(path, brief.replace('```entry doing-another\n## ', '```entry doing-another\n## 1999-13-45 · '));
    const bad = await capture(['apply', 'alpha', path], root);
    assert.equal(bad.code, 1);
    assert.match(bad.err, /doing-another/);
    assert.equal(readFileSync(join(root, 'packs/alpha/provenance/doing-thing.md'), 'utf8'), '', 'one bad entry and nothing is written');
  } finally { removeTree(root); }
});
