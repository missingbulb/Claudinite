import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../../../engine/checks/helpers/code-scanning.mjs';

// A TEST THAT SPELLS A REAL PACK, TASK, SKILL OR CHECK NAME IN A FIXTURE IS A
// TEST THAT HAS TO BE EDITED WHEN THAT THING IS RENAMED OR RETIRED — and the
// edit has nothing to do with what the test asserts. The shelf moves constantly
// (absorptions, renames, retirements), so each such literal is a standing tax on
// every future rename, paid in unrelated diffs a reviewer has to read past to
// find the change.
//
// The distinction is SUBJECT vs FIXTURE. A test that asserts something about
// `basics` - its catalog rows, its checks, its own migration record - names it
// because `basics` is what it is about, and that test SHOULD break when `basics`
// moves. A test that needs "some declared pack" and reaches for `basics` because
// it was the first name to hand has written an arbitrary value as if it were a
// meaningful one: the assertion holds for any id at all.
//
// So the rule reads a name's OWNER off the tree and compares it with the test's
// own home:
//   - a test under `packs/<P>/test/` (or the local pack's) may name <P> and
//     everything <P> owns - that is self-reference, the subject case, and it
//     needs no marker;
//   - every other test uses a fake name. `acme-pack`, `acme-task`, `acme-skill`,
//     `acme-check` and their variants are nobody's, so nothing renames them.
// Where a test genuinely has a foreign real entity as its subject - an engine
// test that loads one named migration record, a conformance test that asserts
// over the real shelf - the line carries `@real-entity <why>` and is spared.
//
// MATCHING IS LITERAL-SCOPED, never a bare token search: a name counts only when
// it is a whole string literal or a whole path segment inside one. That keeps
// `'node:test'` from reading as the `node` pack and an English sentence from
// reading as anything at all - the same "the tree is the oracle" precision the
// reference scanner uses, applied to names instead of paths.

const TEST_FILE = /\.test\.mjs$/;
const MARKER = /@real-entity\b/;
// An import specifier is a DEPENDENCY, not a fixture: the module it names has to
// be the real one, and moving a module is already a change that rewrites everyone
// who imports it. Only invented values are this rule's business.
const IMPORT = /(?:^|[\s;{(])(?:import|export)\s|\bimport\s*\(|^\s*\}?\s*from\s+['"]/;
// Two pack ids are also the name of a program the suites spawn, so `run('node', …)`
// reads as the `node` pack under any matching this rule could do. The id loses its
// cover here rather than every such call needing a marker; a pack named after a
// runtime is the one place where a fixture may still spell a real id.
const ALSO_A_PROGRAM = new Set(['node', 'python']);

// A name's owner, read off where the tree keeps it. Pack ids own themselves.
function readEntityOwners(tracked) {
  const owners = new Map(); // "kind:name" -> owning pack id
  const packs = new Set();
  for (const f of tracked) {
    const pack = packOf(f);
    if (pack) packs.add(pack);
  }
  for (const p of packs) owners.set(`pack:${p}`, p);
  for (const f of tracked) {
    const pack = packOf(f);
    if (!pack) continue;
    let m = /(?:^|\/)tasks\/([^/]+)\/task\.json$/.exec(f);
    if (m) owners.set(`task:${m[1]}`, pack);
    m = /(?:^|\/)skills\/([^/]+)\/SKILL\.md$/.exec(f);
    if (m) owners.set(`skill:${m[1]}`, pack);
    m = /(?:^|\/)worldRules\/([^/]+)\.mjs$/.exec(f);
    if (m) owners.set(`check:${m[1]}`, pack);
  }
  return owners;
}

function packOf(file) {
  const m = /^packs\/([^/]+)\//.exec(file) || /^\.claudinite\/local\/packs\/([^/]+)\//.exec(file);
  return m ? m[1] : null;
}

function addDeclaredCheckOwners(ctx, tracked, owners) {
  for (const f of tracked) {
    if (!f.endsWith('declared-checks.json')) continue;
    const pack = packOf(f);
    if (!pack) continue;
    const source = ctx.read(f);
    if (source === null) continue;
    let declared;
    try { declared = JSON.parse(source); } catch { continue; }
    for (const c of Array.isArray(declared) ? declared : []) {
      if (c && typeof c.id === 'string') owners.set(`check:${c.id}`, pack);
    }
  }
}

// Every string literal on a line, with its quotes dropped. Template literals are
// read the same way: a fixture spelling a pack id inside one is the same tax.
function readStringLiterals(text) {
  const out = [];
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// A literal names `entity` when it IS the name, or carries it as a whole path
// segment. Anything looser reads English words and `node:test` as entity names.
function literalNames(literal, name) {
  if (literal === name) return true;
  if (!literal.includes(name)) return false;
  return new RegExp(`(?:^|/)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|$)`).test(literal);
}

const rule = {
  id: 'test-fixtures-use-fake-entities',
  severity: 'blocking',
  scope: 'world',
  description: 'A test names a real pack, task, skill or check only where that thing is its subject; every other fixture uses a fake name',
  doc: '.claudinite/local/packs/claudinite/RULES.md',
  why: 'a real name written as arbitrary fixture data turns every rename or retirement on the shelf into an edit of unrelated tests, and the diff a reviewer reads is mostly that churn',

  run(ctx) {
    const tests = ctx.tracked.filter((f) => TEST_FILE.test(f) && !f.startsWith('.claudinite/shared/')).sort();
    const out = [];
    // The scope is the repo's own test corpus, large by construction. A pattern
    // that selects nothing reads as live and catches nothing, so an empty set is
    // this rule having gone blind rather than a clean tree.
    if (tests.length === 0) {
      out.push(finding(rule, {
        file: '.claudinite/local/packs/claudinite/worldRules/test-fixtures-use-fake-entities.mjs',
        what: 'this rule selected no test files at all',
        fix: 'the suite moved or the naming convention changed - repoint TEST_FILE at where the tests now live',
      }));
      return out;
    }

    const owners = readEntityOwners(ctx.tracked);
    addDeclaredCheckOwners(ctx, ctx.tracked, owners);
    const entities = [...owners.entries()]
      .map(([key, owner]) => {
        const i = key.indexOf(':');
        return { kind: key.slice(0, i), name: key.slice(i + 1), owner };
      })
      .filter((e) => !ALSO_A_PROGRAM.has(e.name));

    for (const file of tests) {
      const source = ctx.read(file);
      if (source === null) continue;
      const home = packOf(file);
      const raw = source.split('\n');
      const code = stripComments(source).split('\n');
      code.forEach((text, i) => {
        if (MARKER.test(raw[i] ?? '') || IMPORT.test(text)) return;
        const literals = readStringLiterals(text);
        if (literals.length === 0) return;
        for (const { kind, name, owner } of entities) {
          if (owner === home) continue;
          if (!literals.some((l) => literalNames(l, name))) continue;
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: `this fixture spells the real ${kind} \`${name}\`, which ${owner} owns`,
            fix: `use a fake name - \`acme-${kind}\`, or a distinguishable variant where the test needs several - so a rename of \`${name}\` never reaches this file; where the real ${kind} genuinely is what this line asserts about, end the line with \`// @real-entity <why>\``,
          }));
          break;
        }
      });
    }
    return out;
  },
};

export default rule;
