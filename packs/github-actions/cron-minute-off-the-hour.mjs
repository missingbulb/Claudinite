import { finding } from '../../engine/checks/helpers/findings.mjs';
import { workflowFiles } from '../../engine/checks/helpers/github-workflows.mjs';
import { MINUTE_MIN, MINUTE_MAX } from '../../engine/scheduler/hash-minute.mjs';

// Converted from the github-actions-scheduling skill's "Pick a minute off :00".
// GitHub's `schedule:` trigger is a request to queue, and the queue is worst at
// round minutes where every repo on the platform lands at once — a cron on :00
// is the firing most likely to arrive late or be dropped outright, with no
// failure and nothing in the run ledger to look at. The band the skill names is
// the same one the vendored scheduler's own minute is hashed into, so it is read
// from that module rather than re-spelled here.
//
// A positive allowlist: the minute field must be a plain literal inside the
// band. Everything else is flagged — a step value (`*/15`), a list, a range, an
// expression — because each of them puts a firing on :00 or on the hour boundary
// slot math anchors on, and enumerating the bad spellings would miss the next
// one. The rule is about the FORM of the cron, so a `*/15` that happens to be
// harmless here is still the form the rule rejects.
//
// Scoped by parse, not by grep: only a `- cron:` entry inside a `schedule:`
// block's own indentation is a schedule, so a workflow input named `cron`, an
// env var carrying one, or a commented-out line is not judged. The block form is
// the only one read — `schedule: [{cron: …}]` on one line is not judged at all
// rather than judged wrongly.
//
// `.github/workflows/claudinite-scheduler.yml` is excluded: core's
// scheduler-workflow-shape already holds that file to this same band, blocking,
// and a second advisory saying it again is noise.
//
// Advisory: a round-minute cron is a reliability preference, not a defect — the
// workflow is correct and does run, just in the worst slot to be queued in.

const SCHEDULER = '.github/workflows/claudinite-scheduler.yml';
const SCHEDULE_KEY = /^\s*schedule\s*:\s*(?:#.*)?$/;
const CRON_ENTRY = /^\s*-\s*cron\s*:\s*(\S.*)$/;

// The expression itself, out of a quoted or bare YAML scalar with an optional
// trailing comment.
function cronExpression(rest) {
  const quoted = /^(['"])([^'"]*)\1/.exec(rest);
  if (quoted) return quoted[2].trim();
  const comment = rest.indexOf(' #');
  return (comment < 0 ? rest : rest.slice(0, comment)).trim();
}

const inBand = (minute) =>
  /^\d{1,2}$/.test(minute) && Number(minute) >= MINUTE_MIN && Number(minute) <= MINUTE_MAX;

const rule = {
  id: 'gha/cron-minute-off-the-hour',
  severity: 'advisory',
  description: `A scheduled workflow's cron fires on a fixed minute in :${MINUTE_MIN}–:${MINUTE_MAX}, off the :00 stampede`,
  doc: 'packs/github-actions/skills/github-actions-scheduling/SKILL.md',
  why: "GitHub's schedule: trigger is a request to queue rather than a promise to run, and a firing on a round minute — where every repo's cron lands at once — is the one most often delayed or dropped outright, silently",

  run(ctx) {
    const out = [];
    for (const wf of workflowFiles(ctx)) {
      if (wf === SCHEDULER) continue;
      const text = ctx.read(wf);
      if (text === null) continue;
      const lines = text.split('\n');
      let scheduleIndent = null;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line.trim() || /^\s*#/.test(line)) continue;
        const indent = line.search(/\S/);
        if (SCHEDULE_KEY.test(line)) { scheduleIndent = indent; continue; }
        if (scheduleIndent !== null && indent <= scheduleIndent) scheduleIndent = null;
        if (scheduleIndent === null) continue;
        const entry = CRON_ENTRY.exec(line);
        if (!entry) continue;
        const expression = cronExpression(entry[1]);
        const minute = expression.split(/\s+/)[0];
        if (inBand(minute)) continue;
        out.push(finding(rule, {
          file: wf,
          line: i + 1,
          what: `cron "${expression}" fires on minute field "${minute}", not a fixed minute in :${MINUTE_MIN}–:${MINUTE_MAX}`,
          fix: `move the minute into :${MINUTE_MIN}–:${MINUTE_MAX} (a single literal, no step or list) — the band clears the :00 stampede and the hour boundary on both sides; across a fleet, hash the repo name into it so members spread rather than collide`,
        }));
      }
    }
    return out;
  },
};

export default rule;
