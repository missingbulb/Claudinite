// The precondition engine, published for other packs: the term vocabulary, the
// expression grammar, and the one seam that turns a discovered task plus its
// collected signals into a verdict — the same call the executor makes at pick.
export * from '../src/contract/precondition-policy.mjs';
export { loadTaskTerms, TASK_TERMS_FILE } from '../src/contract/task-terms.mjs';
export { evaluatePrecondition } from '../src/contract/precondition.mjs';
