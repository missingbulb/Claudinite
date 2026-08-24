// Published surface (tasks-dispatch DESIGN §18): the wake planner, for packs whose
// tests prove a forced wake reaches their task. Not in anchors.mjs — that module is
// browser-pure and this one's source is not.
export { planWake } from '../queue/scheduler-run.mjs';
