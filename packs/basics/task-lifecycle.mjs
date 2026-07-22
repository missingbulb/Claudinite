import { finding } from '../../engine/checks/helpers/findings.mjs';
import { work } from '../../engine/checks/helpers/work.mjs';

const rule = {
  id: 'task-lifecycle',
  severity: 'blocking',
  description: 'Work on a branch must reference a GitHub issue in at least one commit message',
  doc: 'packs/basics/RULES.md',
  why: 'every task starts from an issue; the reference is what ties the branch to it',

  run(ctx) {
    const { commits } = ctx;
    if (work(ctx).onDefaultBranch() || !commits.length || commits.some((m) => /#\d+/.test(m))) return [];
    return [finding(rule, {
      file: '(branch)',
      what: `none of the ${commits.length} commit(s) since ${ctx.baseRef} references an issue (#N)`,
      fix: 'create or locate the GitHub issue for this task and reference it (e.g. "Refs #N", "Closes #N") in a commit message — amending the latest commit is fine',
    })];
  },
};

export default rule;
