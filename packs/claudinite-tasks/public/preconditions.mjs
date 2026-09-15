// The precondition engine, published for other packs: the signal union a declaration's
// conditions resolve to, the task-local term file, and the one seam that turns a
// discovered task plus its collected signals into a verdict — the same call the
// executor makes at pick.
//
// BOTH evaluators, because a pack's own tests need the one the executor does not use:
// `evaluatePrecondition` takes a DISCOVERED task, which a test asserting a declaration
// against synthetic signals has no way to build, so it reaches for the raw-fields
// `evaluatePreconditions` underneath — the same engine, entered a level lower.
export {
  preconditionSignals, evaluatePreconditions,
} from '../src/contract/precondition-policy.mjs';
export {
  loadTaskTerms, TASK_TERMS_FILE,
} from '../src/contract/task-terms.mjs';
export {
  evaluatePrecondition,
} from '../src/contract/precondition.mjs';
