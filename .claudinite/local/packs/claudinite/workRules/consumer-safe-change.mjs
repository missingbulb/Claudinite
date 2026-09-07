import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../../../engine/checks/helpers/code-scanning.mjs';

// Phase 4 of #593: the rule that stops the class recurring by omission.
//
// `consumer-safe-changes.md` has always SAID that a change to a vendored
// contract must carry consumers across it. Nothing enforced that, and #555
// merged green while eleven consumer packs stopped validating — because the
// canon's own packs were updated in the same commit, and canon CI has nothing
// else to look at.
//
// So this is a check over the canon's OWN diff, not prose about the diff. It
// runs in the WORK scope: the branch's change is exactly what it judges, and
// judging the whole tree would be meaningless (the tree always contains a
// manifest field; the question is whether THIS change added one).
//
// WHAT IT CATCHES. A change that alters a contract every consumer holds a copy
// of, without either of the two things that carry consumers across:
//
//   a MIGRATION RECORD  — <flow>/migrations/<date>-<name>/migration.mjs, the
//                         mechanism that rewrites a member on its next converge
//   a REHEARSAL FIXTURE — vendoring/rehearsal/fixtures.mjs, which proves a
//                         consumer in that shape still converges green
//
// Either satisfies it. They answer different questions — "members are moved
// across" versus "members are unharmed" — and both are legitimate; a change that
// is genuinely additive needs only the second.
//
// DELIBERATELY NARROW. It triggers on three surfaces, each chosen because a
// consumer holds a copy of it and cannot be asked to change in the same commit:
//
//   pack-schema.mjs        the manifest vocabulary — #555's exact surface
//   a rule's `severity`    advisory -> blocking turns a member red overnight
//   either workflow stub   every member vendors it verbatim
//   a removed export       a member's local pack imports the mount by name (#1848)
//
// It does NOT fire on ordinary pack or engine edits. A rule that cried wolf on
// every canon commit would be turned off within a week, and then it would be
// worth nothing on the day it mattered.
const SCHEMA = 'engine/pack_loader/pack-schema.mjs';
// BOTH stubs: a member vendors the executor's workflow as verbatim as the
// scheduler's, and its event trigger names label strings literally — the surface a
// vocabulary change has to carry members across (#1119).
const STUBS = [
  'packs/claudinite-tasks/stubs/claudinite-scheduler.yml',
  'packs/claudinite-tasks/stubs/claudinite-executor.yml',
];
// A record folder, not the machinery beside it: registry/apply edits are engine
// work and carry no member across anything. A record lives under the flow that
// owns it — the engine's own, or one pack's — so both homes count (#768).
const MIGRATION_RECORD = /^(engine|packs\/[^/]+)\/migrations\/\d{4}-\d{2}-\d{2}-[^/]+\//;
const MIGRATIONS = '<engine|packs/*>/migrations/<date>-<name>/';
const FIXTURES = 'vendoring/rehearsal/fixtures.mjs';
// The canon's own local packs — repo-only content, outside every vendor set.
const LOCAL_PACKS = '.claudinite/local/packs';

// The fourth surface (#1848). A member's own local packs import out of the mount —
// `.claudinite/shared/engine/checks/helpers/findings.mjs` is how a local rule builds a
// finding at all — so every name `engine/**` and `packs/**` export is a contract the
// canon has never seen the other side of. The engine root vendors WHOLESALE, so a
// dropped name does not degrade a member: the importing module throws at load, its
// pack fails to load, and the converge's self-test refuses the whole tree.
//
// Neither rehearsal can see it. The canary's local pack imports nothing out of
// `.claudinite/shared/` (a stated design property of its rules), and no fixture local
// pack does either — so both converge green whatever this surface does. #1750 dropped
// nine names from converge-wiring.mjs and left missingbulb/Shepherd#477 parked.
//
// A RE-EXPORT SHIM IS THE DISCHARGE, and it needs no mechanism of its own: a name
// still exported is not a removal. #1750 already gave three of its nine names exactly
// that. The other two answers stay available for a name that genuinely must go.
//
// Measured before widening, over the 60 most recent first-parent commits on main:
// 4 commits would have fired (1 engine, 3 packs). `packs/**` is in because the surface
// is structurally identical — Shepherd's fleet-issues-snapshot worker reaches four
// modules under `shared/packs/`.
const VENDORED_MODULE = /^(engine|packs)\//;

// The names a module exports, by every form the corpus writes: a declaration
// (`export const|let|var|function|async function|class NAME`) and an export list
// (`export { a, b as c }`, where the exported name is what an importer must write).
// `export default` is out: a default is imported by position, not by name.
//
// Comments are stripped first — a commented-out export is not a contract, and the
// engine's own string-aware remover is what tells a `//` inside a string from one that
// opens a comment.
const EXPORT_DECL = /^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}/gm;
export function exportedNames(text) {
  const names = new Set();
  if (typeof text !== 'string') return names;
  const src = stripComments(text);
  for (const m of src.matchAll(EXPORT_DECL)) names.add(m[1]);
  for (const m of src.matchAll(EXPORT_LIST)) {
    for (const part of m[1].split(',')) {
      const spec = part.trim();
      if (!spec) continue;
      const renamed = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(spec);
      names.add(renamed ? renamed[1] : spec.split(/\s+/)[0]);
    }
  }
  return names;
}

// Present in the base, absent from the head. A head that cannot be read is the file
// deleted — every name it exported is gone, which is the shape a whole-module removal
// takes and the one a diff-line rule cannot see. A base that cannot be read is a file
// this change ADDED, and an addition removes nothing.
export function removedExports(file, head, base) {
  if (!VENDORED_MODULE.test(file) || MIGRATION_RECORD.test(file)) return [];
  if (typeof base !== 'string') return [];
  const now = exportedNames(head);
  return [...exportedNames(base)].filter((name) => !now.has(name));
}

// A comment is inert on every surface this rule watches: a member vendors the bytes
// verbatim and nothing reads the prose in them, so rewriting one carries nobody
// anywhere and asking for a migration record would be the cried-wolf firing this
// rule is narrowed to avoid. Both sides must be readable to reach that conclusion —
// an unreadable file stays a contract surface, so the fail-safe answer is the one a
// missing file gets.
//
// `#` only opens a comment at line start or after whitespace, which is what keeps a
// `#` inside a YAML scalar (a URL fragment, an `echo 'a # b'`) a real character.
function stripYamlComments(text) {
  return text.split('\n').map((line) => {
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

const normalize = (text) => text.split('\n').map((l) => l.trimEnd()).filter(Boolean).join('\n');

// `strip` is the language's own comment remover — YAML's above for a stub, the
// engine's string-aware JS one for the schema module.
function commentOnly(head, base, strip) {
  if (typeof head !== 'string' || typeof base !== 'string') return false;
  return normalize(strip(head)) === normalize(strip(base));
}

// The contract surfaces this change touched, and why each counts. Pure over the
// changed-file list plus a head and a base reader, so the whole decision is
// testable with no git.
export function contractChanges(changed, read, readBase = () => null) {
  const out = [];
  if (changed.includes(SCHEMA) && !commentOnly(read(SCHEMA), readBase(SCHEMA), stripComments)) {
    out.push({ file: SCHEMA, what: 'the pack manifest vocabulary — every consumer local pack is validated against it' });
  }
  for (const stub of STUBS) {
    if (changed.includes(stub) && !commentOnly(read(stub), readBase(stub), stripYamlComments)) {
      out.push({ file: stub, what: 'a workflow stub — every member vendors it verbatim' });
    }
  }
  for (const file of changed) {
    // A rule module that BECAME blocking in this change — either newly added, or
    // promoted from advisory. That transition is the one that turns a green member
    // red without the member changing at all. A rule already blocking at the base
    // asked nothing new of anyone, so editing its wording, its `doc` pointer or its
    // logic is an ordinary pack edit and stays out of scope: firing on those would
    // make every touch of a blocking rule a migration question, which is the
    // cried-wolf failure this rule is built to avoid.
    if (!/\.mjs$/.test(file) || /\.test\.mjs$/.test(file) || file.startsWith('engine-tests/')) continue;
    // A rule in the canon's OWN local packs reaches no consumer by construction:
    // the vendor set carries engine/ and packs/, never .claudinite/local/, so such a
    // rule runs in exactly one repo — this one — and its severity asks nothing of
    // anybody else. Firing here would demand a migration for a change no member can
    // even see, which is the cried-wolf failure the narrowing above exists to avoid.
    if (file.startsWith(`${LOCAL_PACKS}/`)) continue;
    const isBlockingRule = (text) => Boolean(text)
      && /severity:\s*'blocking'/.test(text)
      && /^\s*const rule = \{/m.test(text);
    if (isBlockingRule(read(file)) && !isBlockingRule(readBase(file))) {
      out.push({ file, what: 'a rule that became blocking — a severity a member did not ask for turns it red overnight' });
    }
    // One file, one reason: a module reported already — the schema, a stub, a rule
    // that just became blocking — asks the author for the same record or fixture, and
    // a second entry for it would only crowd the one this rule reports.
    if (out.some((entry) => entry.file === file)) continue;
    const gone = removedExports(file, read(file), readBase(file));
    if (gone.length) {
      out.push({
        file,
        what: `an export a member's local pack may import — ${gone.join(', ')} — that this change removes`,
      });
    }
  }
  return out;
}

// Did this change ALSO carry consumers across? Either answer is enough.
export function carriesConsumers(changed) {
  return {
    migration: changed.some((f) => MIGRATION_RECORD.test(f)),
    fixture: changed.includes(FIXTURES),
  };
}

const rule = {
  id: 'consumer-safe-change',
  severity: 'blocking',
  scope: 'work',
  description: 'A change to a contract consumers hold a copy of ships a migration record or a rehearsal fixture',
  doc: 'consumer-safe-changes.md',
  why: 'canon CI cannot see a consumer — the canon\'s own packs are always already migrated, so a change that breaks every member passes it green (#555 did exactly that)',

  run(work) {
    const changed = work.changedFiles ?? [];
    if (!changed.length) return [];
    const touched = contractChanges(changed, (f) => work.read(f), (f) => work.readBase(f));
    if (!touched.length) return [];
    const carried = carriesConsumers(changed);
    if (carried.migration || carried.fixture) return [];

    const first = touched[0];
    return [finding(rule, {
      file: first.file,
      what: `this change touches ${first.what}, but carries no migration record and no rehearsal fixture`,
      fix: `add a record under ${MIGRATIONS} that moves members across, OR a shape in ${FIXTURES} that proves a consumer `
        + 'still converges green — then say in the PR which one you chose and why. If the change is genuinely additive, '
        + 'the fixture is the honest answer; if it renames or requires something, only a record will move the fleet. '
        + 'For a removed export, a re-export shim at the old name is the third and usually the right one.',
    })];
  },
};

export default rule;
