import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderClaudeIndex, corpusRootFor, CLAUDE_INDEX_FILE, CLAUDE_INDEX_IMPORT,
} from '../../engine/pack_loader/generate-claude-index.mjs';
import { claudeIndexContent, writeClaudeIndex } from '../../engine/pack_loader/generate-claude-index.mjs';

// The index is what makes the corpus reach a session at all after #807, and every
// property below is one the harness imposes (the memory docs) rather than a taste
// call — so each test names the harness behaviour it is protecting.

const tmp = (name) => mkdtempSync(join(tmpdir(), `claudinite-${name}-`));

// A pack as the registry hands one over: `dir` absolute, `prose` a filename beside it.
function pack(id, { local = false, dir, prose = 'RULES.md', routing = true } = {}) {
  return {
    id,
    local,
    dir,
    prose,
    ...(routing ? { ruleRoutingGuidance: { belongs: `what ${id} owns`, excludes: `what ${id} does not` } } : {}),
  };
}

// A repo with a vendored mount at .claudinite/shared/ holding the named canon packs,
// plus any local packs under .claudinite/local/packs/.
function makeMember({ canon = [], local = [] } = {}) {
  const root = tmp('member');
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
  mkdirSync(join(root, '.claudinite', 'shared'), { recursive: true });
  return root;
}

const render = (root, packs, active) => renderClaudeIndex(packs, active, {
  indexDir: join(root, '.claudinite'),
  projectRoot: root,
  corpusRoot: corpusRootFor(root),
  directoryPath: join(corpusRootFor(root), 'packs', 'directory.GENERATED.md'),
});

test('every import path is relative to the INDEX, not the project root', () => {
  // The harness resolves a relative `@` path "relative to the file containing the
  // import, not the working directory". The index lives one level down in
  // .claudinite/, so a path written off the root would resolve one directory too
  // shallow and silently import nothing.
  const root = makeMember({ canon: ['basics'], local: ['proj'] });
  const out = render(root, [], [
    pack('basics'),
    pack('proj', { local: true, dir: join(root, '.claudinite', 'local', 'packs', 'proj') }),
  ]);
  assert.match(out, /@shared\/packs\/basics\/RULES\.md/);
  assert.match(out, /@local\/packs\/proj\/RULES\.md/);
  assert.doesNotMatch(out, /@\.claudinite\//, 'a path written off the project root resolves one level too shallow');
});

test('the canon, which mounts nothing, imports its own packs/ through ..', () => {
  // The canon repo runs its live tree: no .claudinite/shared/, so the corpus root is
  // the repo root and the index reaches it by going up out of .claudinite/. It still
  // resolves INSIDE the working directory, so it triggers no external-import dialog.
  const root = tmp('canon');
  mkdirSync(join(root, 'packs', 'basics'), { recursive: true });
  writeFileSync(join(root, 'packs', 'basics', 'RULES.md'), 'basics prose\n');
  assert.equal(corpusRootFor(root), root);
  assert.match(render(root, [], [pack('basics')]), /@\.\.\/packs\/basics\/RULES\.md/);
});

test('a canon pack is re-rooted onto the TARGET corpus, not the loaded one', () => {
  // engine-update.mjs converges a member out of a canon clone: the registry reports
  // the clone's directories while the index is being written for the member. Writing
  // pack.dir there would emit an import traversing to a checkout that exists only on
  // the runner. Simulated here by handing a pack whose `dir` is somewhere else
  // entirely — the rendered path must ignore it.
  const root = makeMember({ canon: ['basics'] });
  const elsewhere = tmp('canon-clone');
  mkdirSync(join(elsewhere, 'packs', 'basics'), { recursive: true });
  writeFileSync(join(elsewhere, 'packs', 'basics', 'RULES.md'), 'basics prose\n');
  const out = render(root, [], [pack('basics', { dir: join(elsewhere, 'packs', 'basics') })]);
  assert.match(out, /@shared\/packs\/basics\/RULES\.md/);
  assert.doesNotMatch(out, /canon-clone/);
});

test('a pack whose prose is not vendored yet is skipped, never imported as a dangling path', () => {
  // The existence test runs against the TARGET. A newly declared pack has no local
  // content until the next refresh (vendoring/DESIGN.md's accepted edge), and an
  // import the harness cannot resolve is worse than an absent one.
  const root = makeMember({ canon: ['basics'] });
  const out = render(root, [], [pack('basics'), pack('notyet')]);
  assert.match(out, /basics\/RULES\.md/);
  assert.doesNotMatch(out, /notyet\/RULES\.md/);
});

test('attribution is visible text, because HTML comments are stripped from a memory file', () => {
  // "Block-level HTML comments in CLAUDE.md files are stripped before the content is
  // injected into Claude's context." The prose injector's `<!-- pack:<id> -->`
  // markers would vanish on this channel, so the pack each import came from has to be
  // carried by something that survives.
  const root = makeMember({ canon: ['basics'] });
  const out = render(root, [], [pack('basics')]);
  assert.doesNotMatch(out, /<!-- pack:/);
  assert.match(out, /\*\*`basics`\*\*/);
  // The maintainer banner is deliberately the opposite: a comment, so it costs no
  // context every session while staying visible to anything that Reads the file.
  assert.match(out, /^<!-- GENERATED — do not hand-edit\./);
});

test('the routing table covers every discovered pack, the imports only the active ones', () => {
  // The discovered set is the set a session can route content INTO; the active set is
  // what it must load. Conflating them either hides a destination or imports prose the
  // repo never declared.
  const root = makeMember({ canon: ['basics', 'other'] });
  const all = [pack('basics'), pack('other')];
  const out = render(root, all, [pack('basics')]);
  assert.match(out, /@shared\/packs\/basics\/RULES\.md/);
  assert.doesNotMatch(out, /@shared\/packs\/other\/RULES\.md/);
  assert.match(out, /\| `other` \| what other owns \|/);
});

test('a repo that runs no Claudinite gets no index at all', () => {
  const root = makeMember();
  assert.equal(render(root, [], []), null);
  // …and through the disk-reading path, where "no active pack" is the same answer.
  return claudeIndexContent(root).then((c) => assert.equal(c, null));
});

test('writeClaudeIndex is idempotent, and never truncates on a fail-soft null', async () => {
  const root = makeMember({ canon: ['basics'] });
  writeFileSync(join(root, '.claudinite-checks.json'), '{ "packs": ["basics"] }\n');
  assert.equal(await writeClaudeIndex(root), true, 'first write lands the file');
  const first = readFileSync(join(root, CLAUDE_INDEX_FILE), 'utf8');
  assert.equal(await writeClaudeIndex(root), false, 'a converge over an unchanged declaration is a no-op');
  assert.equal(readFileSync(join(root, CLAUDE_INDEX_FILE), 'utf8'), first);

  // Nothing to say must leave an existing index alone: the packs may simply not be
  // vendored yet, and blanking the file would take the corpus off the channel with
  // nothing to report it.
  writeFileSync(join(root, '.claudinite-checks.json'), '{ "packs": [] }\n');
  assert.equal(await writeClaudeIndex(root), false);
  assert.equal(readFileSync(join(root, CLAUDE_INDEX_FILE), 'utf8'), first);
});

test('the import line names the index, and both constants agree', () => {
  // The generator writes the file, the converge writes the import and the prose
  // injector tests for both — three call sites that must spell one path.
  assert.equal(CLAUDE_INDEX_IMPORT, `@${CLAUDE_INDEX_FILE.split(/[\\/]/).join('/')}`);
});

test('the index is real markdown a Read can follow: every import resolves on disk', async () => {
  // The end-to-end property. An import the harness cannot resolve is the #807 failure
  // in a new costume — delivered, and empty.
  const root = makeMember({ canon: ['basics'], local: ['proj'] });
  writeFileSync(join(root, '.claudinite', 'local', 'packs', 'proj', 'pack.mjs'), "export default { id: 'proj', rules: [], prose: 'RULES.md' };\n");
  writeFileSync(join(root, '.claudinite-checks.json'), '{ "packs": ["local/proj"] }\n');
  await writeClaudeIndex(root);
  const text = readFileSync(join(root, CLAUDE_INDEX_FILE), 'utf8');
  const imports = [...text.matchAll(/(?:^|\s)@(\S+\.md)/g)].map((m) => m[1]);
  assert.ok(imports.length, text);
  for (const rel of imports) {
    assert.ok(existsSync(join(root, '.claudinite', rel)), `dangling import: @${rel}`);
  }
});
