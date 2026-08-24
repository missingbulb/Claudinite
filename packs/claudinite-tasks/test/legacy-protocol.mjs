// THE LEGACY WIRE LITERALS, in one place because they are data rather than pointers.
//
// The task surface moved to this pack (#1317), but a work item minted before that move still
// carries `engine/scheduler/` in its machine block, and a usage row still carries the old
// executor doc. Both are decoded FOREVER — `BUILT_IN_PATH_RE` in ../built-in-tasks.mjs accepts
// the two roots permanently, and its comment says why: the regex is a validator, so dropping
// either root rejects that half of the ad-hoc request lane outright.
//
// They live here, together, for two reasons. They are copied across five test files, and the
// corpus prefers one shared constant to five literals. And `reference-integrity` reads a
// path-shaped literal as a reference to a file that must exist — true of a pointer, false of
// protocol a decoder must keep understanding — so the waiver for that false positive is one
// entry against this file rather than five against the tests.
export const LEGACY_BUILT_IN_TASK_PATH = 'engine/scheduler/queue/tasks/implement-request/task.md';
export const LEGACY_BUILT_IN_TASK_DIR = 'engine/scheduler/queue/tasks/implement-request';
export const LEGACY_BUILT_IN_TASK_PATH_MOUNTED = `.claudinite/shared/${LEGACY_BUILT_IN_TASK_PATH}`;
export const LEGACY_EXECUTOR_DOC = 'engine/scheduler/executor.md';
