// The write-surface gate for the growth PROMOTE stage (promote.md, this pack).
//
// Promote's write surface is bounded to the shared canon's two homes — packs/
// and skills/. This module is the GUARANTEE: any changed path outside packs/ or
// skills/ fails the gate. The promote AGENT never runs it and needn't know it
// exists — CI runs it automatically on the promote PR (checks-ci.yml, gated on
// the growth-promote branch prefix). The corpus principle it enforces: prose is
// a request; the post-hoc diff check is the guarantee.
//
// Why CI branch-gates it instead of registering it as a pack/skill check that
// runs on every PR: the "packs/skills only" boundary is true for PROMOTE alone —
// an ordinary engine change legitimately edits checks/, routines/, … Nothing in
// the tree marks a diff as a promote run, so no always-on check could self-gate
// to promote; the promote PR's branch prefix is the signal CI keys on.
import { buildContext } from '../../../checks/lib/context.mjs';
import { finding } from '../../../checks/lib/findings.mjs';

const inBounds = (p) => p.startsWith('packs/') || p.startsWith('skills/');

const rule = {
  id: 'promote-scope',
  severity: 'blocking',
  description: 'The growth promote stage writes only under packs/ or skills/',
  doc: '.claudinite/local_packs/canon-curation/promote.md',
  why: 'promote runs unattended with a fleet-wide token; a write outside the canon homes escapes the review-by-blast-radius boundary the growth lifecycle is built on',

  // Every path the branch touches vs the merge-base — added/modified/untracked
  // (allFiles in changed mode) plus deletions — that is not under packs/ or
  // skills/ is one finding. No merge-base ⇒ no diff to scope ⇒ nothing to certify;
  // the CLI wrapper treats that as a hard refusal rather than a silent pass.
  run(ctx) {
    if (!ctx.mergeBase) return [];
    const touched = [...new Set([...ctx.allFiles, ...ctx.deleted])];
    return touched
      .filter((p) => !inBounds(p))
      .sort()
      .map((p) =>
        finding(rule, {
          file: p,
          what: `the promote phase touched ${p}, outside packs/ and skills/`,
          fix: 'a promoted lesson is portable canon — home it in a pack (prose or checks) or a skill; a lesson that can only live outside packs/ and skills/ is out of promote scope, so leave it local',
        })
      );
  },
};

export default rule;

// CLI — CI runs this on the promote PR: `node .claudinite/local_packs/canon-curation/promote-scope.mjs [root]`.
//   exit 0 — every changed path is under packs/ or skills/ (certified)
//   exit 1 — one or more stray paths (the boundary was breached; fail the PR)
//   exit 2 — no merge-base with the base branch, so the diff can't be scoped
if (process.argv[1] && (await import('node:fs')).realpathSync(process.argv[1]) === (await import('node:url')).fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const ctx = buildContext({ root, mode: 'changed' });
  if (!ctx.mergeBase) {
    console.error('promote-scope: no merge-base with the base branch — cannot scope the diff; refusing to certify.');
    process.exit(2);
  }
  const findings = rule.run(ctx);
  if (findings.length) {
    console.error(`promote-scope: FAIL — the promote phase may write only under packs/ or skills/, but this branch also touches ${findings.length} path(s):`);
    for (const f of findings) console.error(`  - ${f.file}`);
    console.error('\nHome each promoted lesson in a pack (prose or checks) or a skill; leave anything that can only live elsewhere local. Do not reach past packs/ and skills/.');
    process.exit(1);
  }
  console.log('promote-scope: OK — every changed path is under packs/ or skills/.');
}
