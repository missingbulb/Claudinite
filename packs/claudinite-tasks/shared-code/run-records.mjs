// Published surface (tasks-dispatch DESIGN §18): the machine-readable records a
// task execution leaves in an Actions log, and their outcome vocabulary.
export {
  TASK_RUN_OUTCOMES, LEGACY_TASK_RUN_OUTCOMES, TASK_EXEC_STATUSES,
  parseTaskExecs, emptyTaskRun, renderTaskExec,
} from '../run-record.mjs';
