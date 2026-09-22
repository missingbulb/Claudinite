import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, A_CANON_PACK } from '../../helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { world } from '../../../engine/checks/helpers/world.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';

const context = (root) => buildContext({ root, mode: 'all' });
const surface = (root) => world(context(root));

const SOURCE = `// speak('end') in a comment is prose about the code, not the code
const a = speak('end');
`;

// ---------------------------------------------------------------- the readings

// THE GUARD ON THE WHOLE DELEGATION, not on the keys someone remembered. The bag
// is handed to every world rule in place of the context, and a member's own local
// pack holds rules this canon has never seen, written against `ctx` — so a key the
// context grows and the bag does not is that member's rule reading `undefined`,
// silently, on a surface that looks complete.
test('world: the surface answers for every key of the context it wraps', () => {
  const root = makeRepo({ changed: { 'a.mjs': SOURCE } });
  try {
    const ctx = context(root);
    const w = world(ctx);
    assert.deepEqual(Object.keys(ctx).filter((key) => !(key in w)), []);
    assert.ok(Object.keys(ctx).length >= 20); // the set it swept, so a shrunken ctx can't pass vacuously
  } finally { cleanup(root); }
});

test('world: a rule written against the raw context reads the same answers off the bag', () => {
  const root = makeRepo({ changed: { 'a.mjs': SOURCE, 'b.md': '# b\n' } });
  try {
    const ctx = context(root);
    const w = world(ctx);
    assert.deepEqual(w.files, ctx.files);
    assert.deepEqual(w.tracked, ctx.tracked);
    assert.equal(w.read('a.mjs'), SOURCE);
    assert.equal(w.exists('b.md'), true);
    assert.equal(w.exists('nowhere.md'), false);
    assert.equal(w.root, ctx.root);
    assert.equal(w.mode, ctx.mode);
  } finally { cleanup(root); }
});

// ---------------------------------------------------------------- sources

test('world: sources reads the admitted files and hands each one four views of itself', () => {
  const root = makeRepo({ changed: { 'a.mjs': SOURCE, 'b.md': '# b\n' } });
  try {
    const { sources } = surface(root);
    const found = sources(/\.mjs$/);
    assert.deepEqual(found.map((s) => s.file), ['a.mjs']);
    assert.equal(found[0].text, SOURCE);
    // The comment NAMING speak('end') is gone; the call that does it survives.
    assert.equal(found[0].code.includes("speak('end') in a comment"), false);
    assert.equal(found[0].code.includes("const a = speak('end');"), true);
    // Line numbers survive the strip, so an index into `code` names the real line.
    assert.equal(found[0].line(found[0].code.indexOf('const a')), 2);
    assert.equal(found[0].json, null); // not JSON, and that is an answer, not a throw
  } finally { cleanup(root); }
});

test('world: sources takes a predicate as readily as a pattern, and draws from the list it is given', () => {
  const root = makeRepo({ changed: { 'a.mjs': SOURCE, 'b.mjs': SOURCE } });
  try {
    const { sources, tracked } = surface(root);
    assert.deepEqual(sources((f) => f === 'b.mjs').map((s) => s.file), ['b.mjs']);
    // `from` is what a rule scanning the tracked tree rather than the sweep's set passes.
    assert.ok(sources(/\.mjs$/, tracked).map((s) => s.file).includes('a.mjs'));
    assert.deepEqual(sources(/\.mjs$/, []).map((s) => s.file), []);
    assert.ok(sources().length >= 2); // no filter admits everything
  } finally { cleanup(root); }
});

test('world: sources drops a file it cannot read rather than handing a rule a null to guard', () => {
  const root = makeRepo({ changed: { 'a.mjs': SOURCE } });
  try {
    const { sources } = world({ ...context(root), files: ['a.mjs', 'gone.mjs'], read: (p) => (p === 'a.mjs' ? SOURCE : null) });
    assert.deepEqual(sources(/\.mjs$/).map((s) => s.file), ['a.mjs']);
  } finally { cleanup(root); }
});

test('world: a file is stripped once per run however many rules ask for it', () => {
  const root = makeRepo({ changed: { 'a.mjs': SOURCE } });
  try {
    const { sources } = surface(root);
    const first = sources(/\.mjs$/)[0].code;
    const second = sources(/\.mjs$/)[0].code;
    // The same string OBJECT, not merely an equal one: the memo is what keeps a
    // sixteen-rule sweep from walking every source file sixteen times.
    assert.ok(Object.is(first, second));
  } finally { cleanup(root); }
});

test('world: a source record parses itself as JSON where it is JSON', () => {
  const root = makeRepo({ changed: { 'x.json': '{"id":"fx"}\n', 'y.json': '{oops\n' } });
  try {
    const { sources, json } = surface(root);
    const byFile = new Map(sources(/\.json$/).map((s) => [s.file, s]));
    assert.deepEqual(byFile.get('x.json').json, { id: 'fx' });
    assert.equal(byFile.get('y.json').json, null);
    assert.deepEqual(json('x.json'), { id: 'fx' });
    assert.equal(json('y.json'), null);
    assert.equal(json('absent.json'), null);
  } finally { cleanup(root); }
});

// ---------------------------------------------------------------- the rest

test('world: filesMatching names the paths, and listDir the names one segment down', () => {
  const root = makeRepo({ changed: { 'packs/acme-pack/pack.mjs': 'export default {};\n', 'packs/acme-pack/skills/acme-skill/SKILL.md': '# acme\n' } });
  try {
    const { filesMatching, listDir } = surface(root);
    assert.ok(filesMatching(/^packs\/acme-pack\//).includes('packs/acme-pack/pack.mjs'));
    assert.deepEqual(listDir('packs/acme-pack').sort(), ['pack.mjs', 'skills']);
    assert.equal(listDir('packs/nothing-here'), null);
  } finally { cleanup(root); }
});

test('world: activePacks is the discovered registry the declaration activates, and packConfig its parameters', () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: [{ id: A_CANON_PACK, config: { k: 1 } }] }) } });
  try {
    const declared = { id: A_CANON_PACK, dir: '/canon/packs/basics' };
    const undeclared = { id: 'acme-pack', dir: '/canon/packs/acme-pack' };
    const { activePacks, packConfig } = world({ ...context(root), packs: [declared, undeclared] });
    assert.deepEqual(activePacks().map((p) => p.id), [A_CANON_PACK]);
    assert.deepEqual(packConfig(A_CANON_PACK), { k: 1 });
    assert.equal(packConfig('acme-pack'), undefined);
  } finally { cleanup(root); }
});

test('world: workflows names the repo\'s Actions workflow files and nothing else beside them', () => {
  const root = makeRepo({ changed: { '.github/workflows/ci.yml': 'name: ci\n', '.github/workflows/notes.md': 'x\n' } });
  try {
    assert.deepEqual(surface(root).workflows(), ['.github/workflows/ci.yml']);
  } finally { cleanup(root); }
});

// ---------------------------------------------------------------- the dispatch

test('world: runRule hands a world rule the world surface and a work rule the work one', () => {
  const root = makeRepo({ changed: { 'a.mjs': SOURCE } });
  try {
    const ctx = context(root);
    const seen = {};
    runRule({ id: 'acme-world-rule', run: (given) => { seen.world = given; return []; } }, ctx);
    runRule({ id: 'acme-work-rule', scope: 'work', run: (given) => { seen.work = given; return []; } }, ctx);
    assert.equal(typeof seen.world.sources, 'function');
    assert.equal(seen.world.jsonPair, undefined);
    assert.equal(typeof seen.work.jsonPair, 'function');
    assert.equal(seen.work.sources, undefined);
  } finally { cleanup(root); }
});
