import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

// The mount's own immutability wall. .claudinite/shared/ is replaced whole by
// the update flow — a member's own edit there is silently overwritten on the
// next converge, so a PR that touches it either loses the edit or, worse,
// looks like it landed until the mount's next refresh discards it. The update
// task itself is the one legitimate writer (its own commit title says so);
// everyone else's fix belongs in the canon, or as a local override under this
// repo's own .claudinite/local/packs/.
const SHARED_ROOT = '.claudinite/shared/';
const UPDATE_RUN = /^Claudinite update\b/;

const rule = {
  id: 'shared-tree-immutable',
  severity: 'blocking',
  scope: 'work',
  doc: 'packs/claudinite-lifecycle/README.md',
  description: 'A PR never edits .claudinite/shared/ directly — that tree is replaced whole by the update flow',
  why: 'the update flow overwrites .claudinite/shared/ on its next run, so a hand-edit there is either silently lost or briefly masks a mount gone stale — the fix belongs in the canon, or as a local override under .claudinite/local/packs/',

  run(work) {
    if (work.onDefaultBranch()) return [];
    if (work.commits.some((m) => UPDATE_RUN.test(m))) return [];
    // .claudinite/shared/ is structurally excluded from ctx.files/changedFiles
    // (the vendored corpus is out of scope for every ordinary check) — so this
    // rule reads the branch's own commits directly, unfiltered, instead.
    const touched = [...new Set(work.branchCommits().flatMap((c) => c.files))];
    return touched
      .filter((p) => p.startsWith(SHARED_ROOT))
      .sort()
      .map((p) => finding(rule, {
        file: p,
        what: `edits ${p}, inside the vendored ${SHARED_ROOT} tree`,
        fix: `revert this file and make the change in the canon instead, or — for a difference this repo alone needs — carry it under .claudinite/local/packs/ (never .claudinite/shared/, which the next update overwrites)`,
      }));
  },
};

export default rule;

// CLI body, mirroring growth-write-scope.mjs's: exit 0 clean, exit 1 on a
// touched path under .claudinite/shared/.
export function runCli(root = process.cwd()) {
  const ctx = buildContext({ root, mode: 'changed' });
  if (!ctx.mergeBase) {
    console.log('shared-tree-immutable: no merge-base with the base branch — nothing to scope.');
    process.exit(0);
  }
  const findings = runRule(rule, ctx);
  if (findings.length) {
    console.error(`shared-tree-immutable: FAIL — this branch edits ${findings.length} path(s) under ${SHARED_ROOT}:`);
    for (const f of findings) console.error(`  - ${f.file}`);
    console.error('\nThat tree is replaced whole by the update flow — fix it in the canon, or carry the difference under .claudinite/local/packs/.');
    process.exit(1);
  }
  console.log(`shared-tree-immutable: OK — no touched path sits under ${SHARED_ROOT}.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv[2] || process.cwd());
}
