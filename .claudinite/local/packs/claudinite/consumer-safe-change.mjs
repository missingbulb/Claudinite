import { finding } from '../../../../engine/checks/helpers/findings.mjs';

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
//
// It does NOT fire on ordinary pack or engine edits. A rule that cried wolf on
// every canon commit would be turned off within a week, and then it would be
// worth nothing on the day it mattered.
const SCHEMA = 'engine/pack_loader/pack-schema.mjs';
// BOTH stubs: a member vendors the executor's workflow as verbatim as the
// scheduler's, and its event trigger names label strings literally — the surface a
// vocabulary change has to carry members across (#1119).
const STUBS = [
  'engine/scheduler/stubs/claudinite-scheduler.yml',
  'engine/scheduler/stubs/claudinite-executor.yml',
];
// A record folder, not the machinery beside it: registry/apply edits are engine
// work and carry no member across anything. A record lives under the flow that
// owns it — the engine's own, or one pack's — so both homes count (#768).
const MIGRATION_RECORD = /^(engine|packs\/[^/]+)\/migrations\/\d{4}-\d{2}-\d{2}-[^/]+\//;
const MIGRATIONS = '<engine|packs/*>/migrations/<date>-<name>/';
const FIXTURES = 'vendoring/rehearsal/fixtures.mjs';
// The canon's own local packs — repo-only content, outside every vendor set.
const LOCAL_PACKS = '.claudinite/local/packs';

// The contract surfaces this change touched, and why each counts. Pure over the
// changed-file list plus a head and a base reader, so the whole decision is
// testable with no git.
export function contractChanges(changed, read, readBase = () => null) {
  const out = [];
  if (changed.includes(SCHEMA)) {
    out.push({ file: SCHEMA, what: 'the pack manifest vocabulary — every consumer local pack is validated against it' });
  }
  for (const stub of STUBS) {
    if (changed.includes(stub)) {
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
        + 'the fixture is the honest answer; if it renames or requires something, only a record will move the fleet.',
    })];
  },
};

export default rule;
