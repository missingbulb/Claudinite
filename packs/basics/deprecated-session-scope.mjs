import { finding } from '../../engine/checks/helpers/findings.mjs';

// `session_scope` on a task declaration is DEPRECATED (owner ruling, 2026-08-09).
// An executor's reach is how its REPO is provisioned — the sheepdog enforcer's
// executor spans the fleet because that repo is the fleet enforcer — never something
// a task asks for. A task author choosing it can only get it wrong, invisibly:
// forgotten where the routing needed it, the dispatch goes to an executor that
// declines it and the scheduler re-arms it hourly forever; declared where it was
// not, a dispatch asks for a fleet-wide grant it never needed. The one standing use
// is the canon home's curation tasks (growth-promote, growth-discover-packs), whose
// separate fleet executor keeps the owner-wide grant off the canon's ordinary
// routine.
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
  description: 'A tasks/<name>/task.mjs does not declare session_scope — an executor\'s reach is how its repo is provisioned, not something a task asks for',
  doc: 'packs/basics/scheduled-tasks.md',
  why: 'a task author choosing the scope can only get it wrong: forgotten, the dispatch goes to an executor that declines it and the task never runs while the scheduler re-arms it hourly; over-declared, a dispatch asks for a fleet-wide grant it never needed — and neither shows up in a run report',

  run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => TASK_MJS.test(f))) {
      const text = ctx.read(file);
      if (text === null || !DECLARES.test(text)) continue;
      out.push(finding(rule, {
        file,
        what: 'declares the deprecated task-level "session_scope"',
        fix: 'drop the field — a dispatch rides ready-for-agent and the executor carries the access its repo provisioned (the canon\'s curation tasks are the one sanctioned holdout; the field still routes correctly while it lingers)',
      }));
    }
    return out;
  },
};

export default rule;
