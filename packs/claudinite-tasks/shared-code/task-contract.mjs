// Published surface (tasks-dispatch DESIGN §18): declaration validation, for other
// packs' tests over their own tasks/<name>/task.mjs.
export { validateTaskDeclaration, OUTCOMES, SIGNAL_NAMES } from '../task-contract.mjs';
export { evaluatePrecondition } from '../queue/executor.mjs';
