import { finding } from '../../engine/checks/helpers/findings.mjs';

// A deleted path an active migration record (migrations/) still names isn't
// stale — it's the declared legacy shape the record keeps until it retires.
// Matched on basename: a legacy alias usually carries a consumer-side prefix.
const MIGRATION_SPEC = /^migrations\/active_migrations\/.*\.mjs$/;
const migrationGoverns = (w) => (gone) => {
  const base = gone.split('/').pop();
  return w.files.some((f) =>
    MIGRATION_SPEC.test(f) && !f.endsWith('.test.mjs') && (w.read(f) ?? '').includes(base));
};

const rule = {
  id: 'reference-integrity',
  severity: 'blocking',
  description: 'Relative Markdown links must resolve, and no tracked file may reference a deleted path',
  doc: 'skills/repo-text-sweeps/SKILL.md',
  scope: 'work',
  why: 'a dangling reference breaks silently — no test fails when a doc link or index entry points at nothing',

  run(w) {
    return [
      ...w.deadLinks().map(({ file, line, target, resolved }) => finding(rule, {
        file, line,
        what: `relative link → ${target} resolves to ${resolved}, which does not exist`,
        fix: 'correct the path or restore the target; when moving or deleting a file, update every inbound reference in the same change',
      })),
      ...w.danglingReferences(migrationGoverns(w)).map(({ file, line, gone }) => finding(rule, {
        file, line,
        what: `still references ${gone}, which this branch deletes`,
        fix: `update or remove the reference — grep the whole tree for "${gone}" and fix every hit in this same change`,
      })),
    ];
  },
};

export default rule;
