// The write-surface gate for the growth PROMOTE stage (tasks/growth-promote/, this pack).
//
// Promote's write surface is bounded to the canon's corpus roots — its `packs/`
// shelf, plus whatever else this canon declares as corpus (canon-config.mjs). This
// module is the GUARANTEE: any changed path outside them fails the gate. The promote
// AGENT never runs it and needn't know it exists — the canon's CI runs it on the
// promote PR, gated on the promote branch prefix. The corpus principle it enforces:
// prose is a request; the post-hoc diff check is the guarantee.
//
// Why the canon's CI branch-gates it instead of registering it as a pack check that
// runs on every PR: the corpus-roots-only boundary is true for PROMOTE alone — an
// ordinary engine change legitimately edits anything. Nothing in the tree marks a
// diff as a promote run, so no always-on check could self-gate to promote; the
// promote PR's branch prefix is the signal CI keys on.
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import { finding } from '../../engine/checks/helpers/findings.mjs';
import { readCorpusRoots } from './canon-config.mjs';

export const BRANCH_PREFIX = 'growth-promote';

const rule = {
  id: 'promote-scope',
  severity: 'blocking',
  description: 'The growth promote stage writes only under this canon\'s corpus roots',
  doc: 'packs/claudinite-canon-curation/tasks/growth-promote/task.md',
  why: 'promote runs unattended with a fleet-wide token; a write outside the corpus roots escapes the review-by-blast-radius boundary the growth lifecycle is built on',

  // Every path the branch touches vs the merge-base — added/modified/untracked
  // (allFiles in changed mode) plus deletions — that is outside the corpus roots is
  // one finding. No merge-base ⇒ no diff to scope ⇒ nothing to certify; the CLI
  // wrapper treats that as a hard refusal rather than a silent pass.
  run(ctx) {
    if (!ctx.mergeBase) return [];
    const roots = readCorpusRoots((p) => ctx.read(p));
    const touched = [...new Set([...ctx.allFiles, ...ctx.deleted])];
    return touched
      .filter((p) => !roots.some((root) => p.startsWith(root)))
      .sort()
      .map((p) =>
        finding(rule, {
          file: p,
          what: `the promote phase touched ${p}, outside ${roots.map((r) => r.slice(0, -1)).join(' and ')}`,
          fix: 'a promoted lesson is portable canon — home it in a pack (prose or checks) or a skill the corpus carries; a lesson that can only live outside the corpus is out of promote scope, so leave it local',
        })
      );
  },
};

export default rule;

// The canon's CI runs this on the promote PR. A canon home wires it in through its
// own invocation — this pack states the boundary and the exit codes, never where a
// particular repo's workflow calls them from:
//   exit 0 — every changed path is inside the corpus roots (certified)
//   exit 1 — one or more stray paths (the boundary was breached; fail the PR)
//   exit 2 — no merge-base with the base branch, so the diff can't be scoped
export function runCli(root = process.cwd()) {
  const ctx = buildContext({ root, mode: 'changed' });
  if (!ctx.mergeBase) {
    console.error('promote-scope: no merge-base with the base branch — cannot scope the diff; refusing to certify.');
    process.exit(2);
  }
  const roots = readCorpusRoots((p) => ctx.read(p));
  const findings = rule.run(ctx);
  if (findings.length) {
    console.error(`promote-scope: FAIL — the promote phase may write only under ${roots.join(', ')}, but this branch also touches ${findings.length} path(s):`);
    for (const f of findings) console.error(`  - ${f.file}`);
    console.error('\nHome each promoted lesson in the corpus; leave anything that can only live elsewhere local. Do not reach past the corpus roots.');
    process.exit(1);
  }
  console.log(`promote-scope: OK — every changed path is under ${roots.join(', ')}.`);
}
