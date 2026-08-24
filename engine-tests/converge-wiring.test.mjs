import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureHooks, removeRetiredCorpusImport, convergeWiring, SETTINGS_PATH,
  removeRetiredBadgeSetting, convergeBadgeRow, renderBadgeRow, badgeRowEntries,
  BADGE_ROW_START, BADGE_ROW_END, README,
  ensureRulesIndexImport, ensureRulesIndexMergeAttribute, RULES_INDEX_MERGE_ATTR,
  ensureMountVendoredAttribute, MOUNT_VENDORED_ATTR,
  seedRepoLocalPack, packIdForRepo,
} from '../engine/converge-wiring.mjs';
import { RULES_INDEX_IMPORT } from '../engine/pack_loader/generate-rules-index.mjs';

const mkRepo = () => mkdtempSync(join(tmpdir(), 'claudinite-wiring-'));
const CANON_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'missingbulb/GoogleCalendarEventCreator';



test('ensureHooks: adds every required hook to a fresh repo, idempotently', () => {
  const root = mkRepo();
  const first = ensureHooks(root);
  assert.deepEqual(first.added.sort(), ['PreToolUse[Bash]', 'SessionEnd', 'SessionStart', 'Stop']);
  const settings = JSON.parse(readFileSync(join(root, SETTINGS_PATH), 'utf8'));
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, 'bash $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/session-start-command.sh');
  assert.equal(settings.hooks.PreToolUse[0].matcher, 'Bash');
  assert.equal(settings.hooks.SessionEnd[0].hooks[0].command, 'node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/session-end-command.mjs');
  // idempotent — nothing added on a second pass
  assert.deepEqual(ensureHooks(root).added, []);
});


test('ensureHooks: preserves a repo\'s own extra hooks (set-union, no clobber)', () => {
  const root = mkRepo();
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, SETTINGS_PATH), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo my-own-stop' }] }] },
  }, null, 2));
  ensureHooks(root);
  const settings = JSON.parse(readFileSync(join(root, SETTINGS_PATH), 'utf8'));
  const stopCommands = settings.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(stopCommands.includes('echo my-own-stop'), 'the repo\'s own hook survives');
  assert.ok(stopCommands.some((c) => c.includes('stop-command.mjs')), 'the required hook is added alongside');
});


test('ensureHooks: a malformed settings file is reported, never overwritten', () => {
  const root = mkRepo();
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, SETTINGS_PATH), '{ not json');
  const r = ensureHooks(root);
  assert.match(r.error, /not valid JSON/);
  assert.equal(readFileSync(join(root, SETTINGS_PATH), 'utf8'), '{ not json', 'left untouched');
});


test('removeRetiredCorpusImport: strips the #385 import line, idempotently', () => {
  const root = mkRepo();
  writeFileSync(join(root, 'CLAUDE.md'), '# Project\n\n@.claudinite/shared/CLAUDE.md\n\nMore text\n');
  assert.equal(removeRetiredCorpusImport(root), true);
  const text = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(!text.includes('@.claudinite/shared/CLAUDE.md'));
  assert.ok(text.includes('More text'), 'the rest of CLAUDE.md is preserved');
  assert.equal(removeRetiredCorpusImport(root), false, 'idempotent — nothing to remove now');
});


test('removeRetiredCorpusImport: no CLAUDE.md is a no-op', () => {
  assert.equal(removeRetiredCorpusImport(mkRepo()), false);
});


// --- the CLAUDE.md channel (#807) ---------------------------------------------

test('ensureRulesIndexImport: adds the import under the title, keeping the repo\'s own CLAUDE.md', () => {
  const root = mkRepo();
  writeFileSync(join(root, 'CLAUDE.md'), '# Project\n\nBuild with `make`.\n');
  assert.equal(ensureRulesIndexImport(root), true);
  const text = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  assert.equal(text.split('\n')[0], '# Project', 'the repo\'s title stays its first line');
  assert.ok(text.includes(RULES_INDEX_IMPORT));
  assert.ok(text.includes('Build with `make`.'), 'the repo\'s own instructions survive');
  assert.equal(ensureRulesIndexImport(root), false, 'idempotent — a converged repo is not rewritten');
});


test('ensureRulesIndexImport: writes a CLAUDE.md when the repo has none', () => {
  // Without the file there is nothing to load the index, so the index would be a
  // generated artifact no session ever reads — the #807 failure with extra steps.
  const root = mkRepo();
  assert.equal(ensureRulesIndexImport(root), true);
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), `${RULES_INDEX_IMPORT}\n`);
});


test('ensureRulesIndexImport: an import documented in backticks does not count as wiring', () => {
  // The harness skips `@` mentions inside code spans, so a CLAUDE.md that only shows
  // the line is one it never follows. Treating that as converged would leave the repo
  // importing nothing while every check reported it healthy.
  const root = mkRepo();
  writeFileSync(join(root, 'CLAUDE.md'), `Claudinite loads via \`${RULES_INDEX_IMPORT}\`.\n`);
  assert.equal(ensureRulesIndexImport(root), true);
  const lines = readFileSync(join(root, 'CLAUDE.md'), 'utf8').split('\n');
  assert.ok(lines.some((l) => !l.includes('`') && l.includes(RULES_INDEX_IMPORT)), 'a real, unquoted import line was added');
});


test('ensureRulesIndexMergeAttribute: declares merge=ours for the generated index, idempotently', () => {
  const root = mkRepo();
  writeFileSync(join(root, '.gitattributes'), 'usage.GENERATED.json merge=ours');
  assert.equal(ensureRulesIndexMergeAttribute(root), true);
  const text = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.ok(text.includes('usage.GENERATED.json merge=ours'), 'the repo\'s existing entries survive');
  assert.ok(text.split('\n').includes(RULES_INDEX_MERGE_ATTR));
  assert.equal(ensureRulesIndexMergeAttribute(root), false);
});


test('ensureMountVendoredAttribute: declares the shared mount vendored, idempotently', () => {
  const root = mkRepo();
  writeFileSync(join(root, '.gitattributes'), 'usage.GENERATED.json merge=ours');
  assert.equal(ensureMountVendoredAttribute(root), true);
  const text = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.ok(text.includes('usage.GENERATED.json merge=ours'), "the repo's existing entries survive");
  assert.ok(text.split('\n').includes(MOUNT_VENDORED_ATTR));
  assert.equal(ensureMountVendoredAttribute(root), false);
});


test('MOUNT_VENDORED_ATTR: the pattern git is handed actually matches a mounted file', () => {
  // The line is only worth carrying if git resolves it over a real mount path — a
  // pattern that matches nothing reads as live and annotates nothing.
  const root = mkRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, '.claudinite', 'shared', 'engine', 'checks'), { recursive: true });
  writeFileSync(join(root, '.claudinite', 'shared', 'engine', 'checks', 'check_the_world.mjs'), '// vendored\n');
  assert.equal(ensureMountVendoredAttribute(root), true);
  const out = execFileSync('git', ['check-attr', 'linguist-vendored', '--',
    '.claudinite/shared/engine/checks/check_the_world.mjs'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /linguist-vendored: set/);
});


test('convergeWiring: lands the index, its import and its merge attribute together', async () => {
  // All three or none: an index nothing imports, or an import with no index behind it,
  // are both a repo whose rules silently do not load.
  const root = mkRepo();
  mkdirSync(join(root, '.claudinite', 'shared', 'packs', 'basics'), { recursive: true });
  writeFileSync(join(root, '.claudinite', 'shared', 'packs', 'basics', 'RULES.md'), 'BASICS PROSE\n');
  writeFileSync(join(root, '.claudinite-settings.json'), '{ "packs": ["basics"] }\n');

  const first = await convergeWiring(root, REPO);
  assert.ok(first.changed.some((c) => c.includes('claudinite-rules.GENERATED.md')), first.changed.join(', '));
  assert.ok(first.changed.some((c) => c.includes('rules-index import')), first.changed.join(', '));
  const index = readFileSync(join(root, '.claudinite', 'claudinite-rules.GENERATED.md'), 'utf8');
  assert.match(index, /@shared\/packs\/basics\/RULES\.md/);
  assert.ok(readFileSync(join(root, 'CLAUDE.md'), 'utf8').includes(RULES_INDEX_IMPORT));
  assert.ok(readFileSync(join(root, '.gitattributes'), 'utf8').includes(RULES_INDEX_MERGE_ATTR));
  assert.ok(readFileSync(join(root, '.gitattributes'), 'utf8').includes(MOUNT_VENDORED_ATTR));

  const second = await convergeWiring(root, REPO);
  assert.ok(!second.changed.some((c) => c.includes('claudinite-rules.GENERATED.md') || c.includes('rules-index')), second.changed.join(', '));
});


test('convergeWiring: a declaration change rewrites the index on the next converge', async () => {
  // The index is a function of the declaration, so the moments a declaration moves —
  // the nightly refresh and any pack change — are exactly when it can go stale. Both
  // call convergeWiring, which is why it is converged here and not left to a session.
  const root = mkRepo();
  for (const id of ['basics', 'tidy-repo']) {
    mkdirSync(join(root, '.claudinite', 'shared', 'packs', id), { recursive: true });
    writeFileSync(join(root, '.claudinite', 'shared', 'packs', id, 'RULES.md'), `${id} prose\n`);
  }
  writeFileSync(join(root, '.claudinite-settings.json'), '{ "packs": ["basics"] }\n');
  await convergeWiring(root, REPO);
  // Held but undeclared: it earns a routing row, never an import.
  const before = readFileSync(join(root, '.claudinite', 'claudinite-rules.GENERATED.md'), 'utf8');
  assert.doesNotMatch(before, /@shared\/packs\/tidy-repo\/RULES\.md/);

  writeFileSync(join(root, '.claudinite-settings.json'), '{ "packs": ["basics", "tidy-repo"] }\n');
  const r = await convergeWiring(root, REPO);
  assert.ok(r.changed.some((c) => c.includes('claudinite-rules.GENERATED.md')));
  assert.match(readFileSync(join(root, '.claudinite', 'claudinite-rules.GENERATED.md'), 'utf8'), /@shared\/packs\/tidy-repo\/RULES\.md/);
});


test('seedRepoLocalPack: names the pack for the repo, in kebab-case', () => {
  // The id is the pack's public address — the declaration spells it, the mount path
  // carries it, every cross-reference repeats it — so it follows the canon's naming
  // rule (lowercase words joined by single hyphens) rather than the repo's casing.
  assert.equal(packIdForRepo('missingbulb/GoogleCalendarEventCreator'), 'google-calendar-event-creator');
  assert.equal(packIdForRepo('owner/EdFringeNow'), 'ed-fringe-now');
  assert.equal(packIdForRepo('owner/my_repo.v2'), 'my-repo-v2');
  assert.equal(packIdForRepo(''), '');
});


test('seedRepoLocalPack: creates the repo\'s own pack, declares it, and the index imports it', async () => {
  // A repo's own lessons need a home the moment there is one to write; a session that
  // must invent the home first tends not to, and writes the rule into `basics` or a
  // CLAUDE.md paragraph instead. Seeding it at adoption is what makes the local pack
  // the obvious destination rather than a decision.
  const root = mkRepo();
  mkdirSync(join(root, '.claudinite', 'shared', 'packs', 'basics'), { recursive: true });
  writeFileSync(join(root, '.claudinite', 'shared', 'packs', 'basics', 'RULES.md'), 'BASICS\n');
  writeFileSync(join(root, '.claudinite-settings.json'), '{\n  "packs": [\n    "basics"\n  ]\n}\n');

  const r = await convergeWiring(root, 'missingbulb/HelloWorldFlutterApp', { seedLocalPack: true });
  assert.ok(r.changed.some((c) => c.includes('hello-world-flutter-app')), r.changed.join(', '));

  const dir = join(root, '.claudinite', 'local', 'packs', 'hello-world-flutter-app');
  assert.ok(existsSync(join(dir, 'pack.mjs')));
  assert.ok(existsSync(join(dir, 'RULES.md')));
  // The pack's change record, seeded empty. Every growth task writes its rows
  // here rather than to a standing issue of its own, so the file has to exist
  // before the first run rather than be invented by whichever task ran first.
  assert.ok(existsSync(join(dir, 'VERSIONS.md')));
  // Declared, so it is active…
  assert.match(readFileSync(join(root, '.claudinite-settings.json'), 'utf8'), /"local\/hello-world-flutter-app"/);
  // …and the index the same converge wrote imports it. Seeding runs BEFORE the index
  // for exactly this reason: a pack declared after it would go unimported until some
  // later converge, which is a repo whose own rules silently do not load.
  assert.match(readFileSync(join(root, '.claudinite', 'claudinite-rules.GENERATED.md'), 'utf8'),
    /@local\/packs\/hello-world-flutter-app\/RULES\.md/);
});


test('seedRepoLocalPack: never runs on the nightly, and never twice', async () => {
  // Both halves matter. The nightly must not create it: a repo that deleted its local
  // pack made a real choice, and a converge that re-seeded it would overrule that
  // every night. And a repo that already has a local pack must not get a second,
  // empty one beside the home its lessons already live in.
  const root = mkRepo();
  writeFileSync(join(root, '.claudinite-settings.json'), '{\n  "packs": [\n    "basics"\n  ]\n}\n');

  const nightly = await convergeWiring(root, 'o/thing');
  assert.ok(!nightly.changed.some((c) => c.includes('local/packs')), nightly.changed.join(', '));
  assert.equal(existsSync(join(root, '.claudinite', 'local', 'packs', 'thing')), false);

  assert.equal(seedRepoLocalPack(root, 'o/thing'), 'thing');
  assert.equal(seedRepoLocalPack(root, 'o/thing'), null, 'a second adoption must not re-seed');
  // …nor seed a differently-named one beside a local pack the repo already has.
  assert.equal(seedRepoLocalPack(root, 'o/renamed'), null);
});


test('seedRepoLocalPack: the seeded manifest is a valid pack the registry loads', async () => {
  // A seed that does not validate is worse than none: the pack fails to load, its
  // prose never reaches the index, and the repo carries a broken home for its rules.
  const root = mkRepo();
  writeFileSync(join(root, '.claudinite-settings.json'), '{\n  "packs": []\n}\n');
  assert.equal(seedRepoLocalPack(root, 'o/Seed-Repo'), 'seed-repo');

  const { discoverPacks } = await import('../engine/pack_loader/pack-registry.mjs');
  const { packs, errors } = await discoverPacks({ localRoot: root });
  assert.deepEqual(errors, [], JSON.stringify(errors));
  const seeded = packs.find((p) => p.id === 'seed-repo');
  assert.ok(seeded, 'the seeded manifest did not load');
  assert.equal(seeded.prose, 'RULES.md');
  assert.ok(seeded.ruleRoutingGuidance.belongs && seeded.ruleRoutingGuidance.excludes);
});


test('convergeWiring: reports every surface it changed, and is idempotent', async () => {
  const root = mkRepo();
  writeFileSync(join(root, 'CLAUDE.md'), '@.claudinite/shared/CLAUDE.md\ndocs\n');
  writeFileSync(join(root, '.claudinite-settings.json'), '{\n  "packs": [],\n  "badges": { "readme": "auto" }\n}\n');
  const first = await convergeWiring(root, REPO);
  assert.ok(first.changed.some((c) => c.startsWith('hook:')));
  assert.ok(first.changed.some((c) => c.includes('corpus import')));
  assert.ok(first.changed.some((c) => c.includes('retired badges setting')));
  // second run: fully converged → nothing changes
  assert.deepEqual((await convergeWiring(root, REPO)).changed, []);
});



// --- the README pack-badge row ---------------------------------------------

const CHECKS_PATH = '.claudinite-settings.json';
const ROW = [{ id: 'basics', path: 'packs/basics/badge.svg' }, { id: 'tidy-repo', path: 'packs/tidy-repo/badge.svg' }];

test('removeRetiredBadgeSetting: cuts the retired knob out as text, leaving the rest byte-identical', () => {
  const root = mkRepo();
  assert.equal(removeRetiredBadgeSetting(root), false, 'no settings file — nothing to clean');
  // An em dash written literally, as a real settings file's prose carries it: a
  // JSON round-trip would re-escape it and turn this into a whole-file diff.
  const before = '{\n  "packs": ["basics"],\n  "badges": {\n    "readme": "auto"\n  },\n  "accept": [{ "reason": "core — the engine" }]\n}\n';
  writeFileSync(join(root, CHECKS_PATH), before);
  assert.equal(removeRetiredBadgeSetting(root), true);
  const after = readFileSync(join(root, CHECKS_PATH), 'utf8');
  assert.equal(after, before.replace('  "badges": {\n    "readme": "auto"\n  },\n', ''),
    'only the knob\'s lines go — every other byte, escaping included, is untouched');
  assert.equal(removeRetiredBadgeSetting(root), false, 'idempotent');
});


test('removeRetiredBadgeSetting: the knob as the LAST key takes its trailing comma with it', () => {
  const root = mkRepo();
  writeFileSync(join(root, CHECKS_PATH), '{\n  "packs": ["basics"],\n  "badges": { "readme": "off" }\n}\n');
  assert.equal(removeRetiredBadgeSetting(root), true);
  const text = readFileSync(join(root, CHECKS_PATH), 'utf8');
  assert.deepEqual(JSON.parse(text), { packs: ['basics'] }, 'still valid JSON, knob gone');
  assert.ok(!text.includes('badges'));
});


test('removeRetiredBadgeSetting: malformed settings are left untouched, never rewritten', () => {
  const root = mkRepo();
  writeFileSync(join(root, CHECKS_PATH), '{ not json\n');
  assert.equal(removeRetiredBadgeSetting(root), false);
  assert.equal(readFileSync(join(root, CHECKS_PATH), 'utf8'), '{ not json\n');
});


test('convergeBadgeRow: introduces the row under the title', () => {
  const root = mkRepo();
  writeFileSync(join(root, README), '# Project\n\nSome prose.\n');
  assert.equal(convergeBadgeRow(root, ROW), true);
  const text = readFileSync(join(root, README), 'utf8');
  assert.equal(text.split('\n')[0], '# Project');
  assert.ok(text.includes(renderBadgeRow(ROW)));
  assert.ok(text.includes('Some prose.'), 'the README it found is not replaced');
  assert.equal(convergeBadgeRow(root, ROW), false, 'idempotent');
});


test('convergeBadgeRow: a README with no heading takes the row at the top', () => {
  const root = mkRepo();
  writeFileSync(join(root, README), 'Just prose.\n');
  convergeBadgeRow(root, ROW);
  const lines = readFileSync(join(root, README), 'utf8').split('\n');
  assert.equal(lines.slice(0, 2).join('\n'), renderBadgeRow(ROW));
});


// The whole point of the row is that it renders. A line that BEGINS with `<!--`
// opens a CommonMark HTML block that runs through the line carrying `-->`, so
// badges written after the opening marker on its line reach a README as the
// literal text `![basics](…)` (#587). The opening marker therefore owns its line
// and the badges start the next one — pinned here because nothing else would
// notice the day someone "tidies" the row back onto one line.
test('renderBadgeRow: the badges start their own line, so markdown parses them', () => {
  const lines = renderBadgeRow(ROW).split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], BADGE_ROW_START, 'the opening marker owns its line');
  assert.ok(!lines[1].startsWith('<!--'), 'the badge line must not open an HTML block');
  assert.ok(lines[1].startsWith('![basics]'));
  assert.ok(lines[1].endsWith(BADGE_ROW_END), 'the closing marker stays inline, so a tagline can follow it');
});


test('convergeBadgeRow: re-converges in place, keeping what the repo wrote beside it', () => {
  const root = mkRepo();
  // The stale row is in the pre-#587 single-line form, so this also covers the
  // migration a consumer's next nightly performs.
  const stale = `# P\n\n${BADGE_ROW_START}![gone](packs/gone/badge.svg "gone")${BADGE_ROW_END} &nbsp;our own tagline\n`;
  writeFileSync(join(root, README), stale);
  assert.equal(convergeBadgeRow(root, ROW), true);
  const text = readFileSync(join(root, README), 'utf8');
  assert.ok(text.includes(renderBadgeRow(ROW)));
  assert.ok(!text.includes('gone'), 'the stale row is replaced, not appended to');
  assert.ok(text.includes(`${BADGE_ROW_END} &nbsp;our own tagline`),
    'what the repo wrote after the closing marker stays on the badges line, where it renders');
});


test('convergeBadgeRow: no README, or nothing to show, writes nothing', () => {
  const root = mkRepo();
  assert.equal(convergeBadgeRow(root, ROW), false, 'never creates a README');
  writeFileSync(join(root, README), '# P\n');
  assert.equal(convergeBadgeRow(root, []), false);
  assert.equal(readFileSync(join(root, README), 'utf8'), '# P\n', 'an empty row is not an empty block');
});


test('convergeWiring: leaves the README alone unless the caller asks for badges', async () => {
  const root = mkRepo();
  writeFileSync(join(root, CHECKS_PATH), '{\n  "packs": ["basics"]\n}\n');
  writeFileSync(join(root, README), '# P\n\nprose\n');
  // The nightly's call — no badges. A baselining run must never produce a
  // README diff.
  const nightly = await convergeWiring(root, REPO);
  assert.ok(!nightly.changed.some((c) => c.includes(README)));
  assert.equal(readFileSync(join(root, README), 'utf8'), '# P\n\nprose\n');
  // Bootstrap's call — the row is seeded once.
  const { changed } = await convergeWiring(root, REPO, { badges: true });
  assert.ok(changed.some((c) => c.includes(README)));
  assert.ok(readFileSync(join(root, README), 'utf8').includes(BADGE_ROW_START));
});


test('badgeRowEntries: skips a declared pack that carries no badge file', async () => {
  const root = mkRepo();
  const ids = (await badgeRowEntries(root, { packs: ['basics', 'nonexistent-pack'] })).map((e) => e.id);
  assert.ok(ids.includes('basics'));
  assert.ok(!ids.includes('nonexistent-pack'), 'an id naming no pack contributes nothing');
});

// --- the work-item queue's wiring (tasks-dispatch DESIGN §14) -----------------
// The repo's one cron workflow keeps its path and changes its CONTENT with the
// dispatch mode; the executor is a second workflow beside it, and it is the only
// place a secret ever reaches at all (#1301).

const SCHEDULER_STUB = "name: Claudinite scheduler\non:\n  schedule:\n    - cron: '10 * * * *'\n  workflow_dispatch:\n"
  + "jobs:\n  scheduler-run:\n    steps:\n      - name: Scheduler run\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: node scheduler-run.mjs\n"
  + "  drain:\n    steps:\n      - name: Drain\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: node executor.mjs\n";

const EXECUTOR_STUB_TEXT = "name: Claudinite executor\non:\n  issues:\n    types: [labeled]\n"
  + "jobs:\n  execute:\n    steps:\n      - env:\n          GITHUB_TOKEN: ${{ github.token }}\n          CLAUDINITE_SECRETS: ${{ toJSON(secrets) }}\n        run: node executor.mjs\n";
