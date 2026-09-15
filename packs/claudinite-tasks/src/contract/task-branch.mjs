// THE BRANCH FAMILY — the naming that makes a branch, and the pull request on it,
// recognisable as one task's own. It is contract rather than delivery: the
// executor mints names from it before code-work, and a precondition asks the same
// question of the open pull requests before either has happened, so neither side
// may spell the prefix for itself.

export const BRANCH_ROOT = 'claudinite';

// Every branch the executor mints lives under one root, and every task under its
// own prefix beneath it — which is what makes the prefix a family, not a guess.
export const taskBranchPrefix = (taskId) => `${BRANCH_ROOT}/${taskId}/`;

// Whether a branch belongs to a task's family. `null` is UNKNOWN — a ref that
// could not be read — and a caller ruling on pending work must treat it as such
// rather than as "not mine".
export const isTaskBranch = (ref, taskId) =>
  (typeof ref === 'string' ? ref.startsWith(taskBranchPrefix(taskId)) : null);
