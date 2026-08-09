import { finding } from '../../engine/checks/helpers/findings.mjs';

// `session_scope` on a task declaration is DEPRECATED (owner ruling, 2026-08-09).
// Which executor session a dispatch goes to follows from the OWNING PACK's reach —
// `sessionScope` on the manifest — not from a per-task field.
//
// The reason it moved is that a task author choosing it can only get it wrong. Forget
// it on a task that reaches other repos and the dispatch is filed to the self
// executor, which declines it as another scope's; the session ends without
// commenting, the scheduler re-arms the issue hourly, and the task never runs —
// silently and forever. Declare it where it was not warranted and an ordinary
// project's dispatch carries a fleet-wide session grant it never needed. Neither
// mistake is visible in a run report. A pack whose whole purpose is reaching other
// repos knows the answer once, for everything it contributes.
//
// ADVISORY, not blocking, and deliberately so: the field still WORKS
// (engine/scheduler/session-scope.mjs honours it wherever the pack declares nothing),
// so a repo carrying one is out of date, not broken. Blocking here would break repos
// that are running correctly, which is not what a deprecation is for.
//
// RELEVANCE FIRST (engine/checks/README.md): keyed off a `tasks/<name>/task.mjs`
// existing and mentioning the field, so it is inert on every repo without tasks and
// on every task that already moved.
const TASK_MJS = /(^|\/)tasks\/[^/]+\/task\.mjs$/;
// The declaration site, not a mention in a comment — a task file that merely explains
// where its scope comes from (as sheepdog's fleet-fit does) is the OUTCOME this check
// wants, and flagging it would punish the migration it is asking for.
const DECLARES = /^\s*session_scope:\s*['"]/m;

const rule = {
  id: 'deprecated-session-scope',
  severity: 'advisory',
  description: 'A tasks/<name>/task.mjs does not declare session_scope — the executor session scope is the owning pack\'s `sessionScope`, not a per-task field',
  doc: 'packs/basics/scheduled-tasks.md',
  why: 'a task author choosing the scope can only get it wrong: forgotten, the dispatch goes to an executor that declines it and the task never runs while the scheduler re-arms it hourly; over-declared, an ordinary project\'s dispatch carries a fleet-wide grant — and neither shows up in a run report',

  run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => TASK_MJS.test(f))) {
      const text = ctx.read(file);
      if (text === null || !DECLARES.test(text)) continue;
      out.push(finding(rule, {
        file,
        what: 'declares the deprecated task-level "session_scope"',
        fix: 'drop the field and declare `sessionScope` on the owning pack\'s pack.mjs instead — every task the pack contributes then carries that reach (the field still routes correctly until you do)',
      }));
    }
    return out;
  },
};

export default rule;
