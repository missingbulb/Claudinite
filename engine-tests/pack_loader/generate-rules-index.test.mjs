import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ruleImports, renderRulesIndex, corpusRootFor, writeRulesIndex, rulesIndexImports,
  RULES_INDEX_FILE, RULES_INDEX_IMPORT,
} from '../../engine/pack_loader/generate-rules-index.mjs';

// The index is the ONLY channel a pack's prose reaches a session on after #807, and
// every property below is one the harness imposes (the memory docs) rather than a
// taste call — so each test names the harness behaviour it protects.

const tmp = (name) => mkdtempSync(join(tmpdir(), `claudinite-${name}-`));

// A pack as the registry hands one over: `dir` absolute, `prose` a filename beside it.
const pack = (id, { local = false, dir, prose = 'RULES.md' } = {}) => ({ id, local, dir, prose });

// A repo with a vendored mount at .claudinite/shared/ holding the named canon packs,
// plus any local packs under .claudinite/local/packs/.
function makeMember({ canon = [], local = [] } = {}) {
  const root = tmp('member');
  mkdirSync(join(root, '.claudinite', 'shared'), { recursive: true });
  for (const id of canon) {
    const dir = join(root, '.claudinite', 'shared', 'packs', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'RULES.md'), `${id} prose\n`);
  }
  for (const id of local) {
    const dir = join(root, '.claudinite', 'local', 'packs', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'RULES.md'), `${id} prose\n`);
  }
  return root;
}

const imports = (root, active) => ruleImports(active, {
  indexDir: join(root, '.claudinite'),
  corpusRoot: corpusRootFor(root),
});

test('every import path is relative to the INDEX, not the project root', () => {
  // The harness resolves a relative `@` path "relative to the file containing the
  // import, not the working directory". The index lives one level down in
  // .claudinite/, so a path written off the root would resolve one directory too
  // shallow and silently import nothing.
  const root = makeMember({ canon: ['acme-pack'], local: ['proj'] });
  const out = renderRulesIndex(imports(root, [
    pack('acme-pack'),
    pack('proj', { local: true, dir: join(root, '.claudinite', 'local', 'packs', 'proj') }),
  ]));
  assert.match(out, /^@shared\/packs\/acme-pack\/RULES\.md$/m);
  assert.match(out, /^@local\/packs\/proj\/RULES\.md$/m);
  assert.doesNotMatch(out, /@\.claudinite\//, 'a path written off the project root resolves one level too shallow');
});

test('the canon, which mounts nothing, imports its own packs/ through ..', () => {
  // The canon runs its live tree: no .claudinite/shared/, so the corpus root is the
  // repo root and the index reaches it by going up out of .claudinite/. It still
  // resolves INSIDE the working directory, so it triggers no external-import dialog.
  const root = tmp('canon');
  mkdirSync(join(root, 'packs', 'acme-pack'), { recursive: true });
  writeFileSync(join(root, 'packs', 'acme-pack', 'RULES.md'), 'acme-pack prose\n');
  assert.equal(corpusRootFor(root), root);
  assert.match(renderRulesIndex(imports(root, [pack('acme-pack')])), /^@\.\.\/packs\/acme-pack\/RULES\.md$/m);
});

test('a canon pack is re-rooted onto the TARGET corpus, not the loaded one', () => {
  // engine-update.mjs converges a member out of a canon clone: the registry reports
  // the clone's directories while the index is being written for the member. Writing
  // pack.dir there would emit an import traversing to a checkout that exists only on
  // the runner. Simulated by handing a pack whose `dir` is somewhere else entirely.
  const root = makeMember({ canon: ['acme-pack'] });
  const elsewhere = tmp('canon-clone');
  mkdirSync(join(elsewhere, 'packs', 'acme-pack'), { recursive: true });
  writeFileSync(join(elsewhere, 'packs', 'acme-pack', 'RULES.md'), 'acme-pack prose\n');
  const out = renderRulesIndex(imports(root, [pack('acme-pack', { dir: join(elsewhere, 'packs', 'acme-pack') })]));
  assert.match(out, /@shared\/packs\/acme-pack\/RULES\.md/);
  assert.doesNotMatch(out, /canon-clone/);
});

test('a pack with no prose, or whose prose is not vendored yet, is skipped', () => {
  // The existence test runs against the TARGET. A newly declared pack has no local
  // content until the next refresh (vendoring/DESIGN.md's accepted edge), and an
  // import the harness cannot resolve is worse than an absent one. `prose: null` is
  // the same answer from the other direction — several canon packs carry no prose.
  const root = makeMember({ canon: ['acme-pack'] });
  const out = renderRulesIndex(imports(root, [pack('acme-pack'), pack('notyet'), pack('quiet', { prose: null })]));
  assert.match(out, /acme-pack\/RULES\.md/);
  assert.doesNotMatch(out, /notyet/);
  assert.doesNotMatch(out, /quiet/);
});

test('the file holds nothing but imports and one stripped comment', () => {
  // "ONLY the hard imports" (owner, #807). The banner is an HTML comment on purpose:
  // block comments are stripped before a memory file enters context, so it costs
  // nothing every session while staying visible to anything that Reads the file.
  const root = makeMember({ canon: ['acme-pack', 'other'] });
  const lines = renderRulesIndex(imports(root, [pack('acme-pack'), pack('other')])).trim().split('\n');
  assert.match(lines[0], /^<!-- GENERATED/);
  assert.deepEqual(lines.slice(1), ['@shared/packs/acme-pack/RULES.md', '@shared/packs/other/RULES.md']);
  // No routing table, no prose, no per-pack labels — those duplicated
  // packs/directory.GENERATED.md, which every mount already carries.
  const text = renderRulesIndex(imports(root, [pack('acme-pack')]));
  assert.doesNotMatch(text, /routing|Belongs|\|/);
});

test('an import is never wrapped in backticks', () => {
  // The harness skips `@` mentions inside code spans, so a quoted import is one it
  // never follows — a file that looks right and loads nothing.
  const root = makeMember({ canon: ['acme-pack'] });
  for (const line of renderRulesIndex(imports(root, [pack('acme-pack')])).split('\n')) {
    if (line.includes('@')) assert.ok(!line.includes('`'), line);
  }
});

test('a repo with nothing to import gets no index at all', async () => {
  const root = makeMember();
  assert.equal(renderRulesIndex([]), null);
  assert.deepEqual(await rulesIndexImports(root), []);
});

test('writeRulesIndex is idempotent, and never truncates on a fail-soft empty', async () => {
  const root = makeMember({ canon: ['basics'] }); // @real-entity writeRulesIndex discovers packs off the real corpus, so the id must be one it carries
  writeFileSync(join(root, '.claudinite-settings.json'), '{ "packs": ["basics"] }\n'); // @real-entity writeRulesIndex discovers packs off the real corpus, so the id must be one it carries
  assert.equal(await writeRulesIndex(root), true, 'first write lands the file');
  const first = readFileSync(join(root, RULES_INDEX_FILE), 'utf8');
  assert.equal(await writeRulesIndex(root), false, 'an update over an unchanged declaration is a no-op');
  assert.equal(readFileSync(join(root, RULES_INDEX_FILE), 'utf8'), first);

  // Nothing to import must leave an existing index alone: the packs may simply not be
  // vendored yet, and blanking the file would take the rules off the channel with
  // nothing to say so.
  writeFileSync(join(root, '.claudinite-settings.json'), '{ "packs": [] }\n');
  assert.equal(await writeRulesIndex(root), false);
  assert.equal(readFileSync(join(root, RULES_INDEX_FILE), 'utf8'), first);
});

test('the import line names the index, and both constants agree', () => {
  // The generator writes the file, the update writes the import, and the
  // rules-index-current check tests for both — three call sites, one path.
  assert.equal(RULES_INDEX_IMPORT, `@${RULES_INDEX_FILE.split(/[\\/]/).join('/')}`);
});

test('the index names exactly the packs a repo declares, and every import resolves', async () => {
  // The end-to-end property, and the one #807 is ultimately about: the channel is only
  // worth having if what arrives on it is this repo's actual rule set. An import that
  // resolves to nothing is the same failure in a new costume — delivered, and empty.
  const root = makeMember({ canon: ['acme-pack'], local: ['proj'] });
  writeFileSync(join(root, '.claudinite', 'local', 'packs', 'proj', 'pack.mjs'), "export default { id: 'proj', rules: [], prose: 'RULES.md' };\n");
  writeFileSync(join(root, '.claudinite-settings.json'), '{ "packs": ["local/proj"] }\n');
  await writeRulesIndex(root);

  const text = readFileSync(join(root, RULES_INDEX_FILE), 'utf8');
  const paths = text.split('\n').filter((l) => l.startsWith('@')).map((l) => l.slice(1));
  assert.ok(paths.length, text);
  for (const rel of paths) assert.ok(existsSync(join(root, '.claudinite', rel)), `dangling import: @${rel}`);
  assert.deepEqual(
    (await rulesIndexImports(root)).map((i) => i.id).sort(),
    paths.map((p) => p.replace(/.*\/packs\/([^/]+)\/.*/, '$1')).sort(),
    'the imports and the resolved active set must name the same packs',
  );
});

// THE COPIED USER PACK'S LINE. A pack may copy another pack into the session — content
// belonging to the person in front of it — and that pack's prose has to reach the session
// on this channel rather than on hook stdout, which is what #807 measured being truncated.
// The index cannot discover it: an index is written when a repo converges, and the
// directory is written when a session starts, hours later and on another machine. So the
// line is literal, and it appears exactly where a pack that copies one in exists to fill it.
const copying = (id, dir) => ({ ...pack(id, { dir }), dir });

test('the index carries the copied pack\'s prose when, and only when, a pack copies', () => {
  const root = makeMember({ canon: ['acme-pack', 'web'] });
  const plain = join(root, '.claudinite', 'shared', 'packs', 'acme-pack');
  const copies = join(root, '.claudinite', 'shared', 'packs', 'web');
  writeFileSync(join(copies, 'session-prepare.mjs'), 'process.exit(0);\n');

  const without = imports(root, [pack('acme-pack', { dir: plain })]).map((i) => i.id);
  assert.ok(!without.includes('current_user'), 'a repo whose packs copy nothing imports nothing copied');

  const withCopy = imports(root, [pack('acme-pack', { dir: plain }), copying('web', copies)]);
  const line = withCopy.at(-1);
  assert.equal(line.id, 'current_user');
  // LAST: a person's own rules are read against the project's, so they follow them.
  assert.equal(line.path, 'temp/packs/current_user/RULES.md');
});

test('a copied pack discovered mid-session is not imported twice', () => {
  // The index must render the same in CI, where nothing has been copied, and in a live
  // session, where the registry does find the copied directory. Only the literal line
  // carries it.
  const root = makeMember({ canon: ['web'] });
  const copies = join(root, '.claudinite', 'shared', 'packs', 'web');
  writeFileSync(join(copies, 'session-prepare.mjs'), 'process.exit(0);\n');
  const copied = join(root, '.claudinite', 'temp', 'packs', 'current_user');
  mkdirSync(copied, { recursive: true });
  writeFileSync(join(copied, 'RULES.md'), '# Mine\n');

  const ids = imports(root, [
    copying('web', copies),
    { ...pack('current_user', { dir: copied }), temp: true },
  ]).map((i) => i.id);
  assert.deepEqual(ids, ['web', 'current_user'], 'the discovered copy adds no second import');
});
