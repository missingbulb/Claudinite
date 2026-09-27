import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
// Namespace import with a capability probe, not a named one: the pack and engine
// lanes deliver on their own cadences, and a member holding this pack beside an
// engine that predates the accessor must load the pack rather than fault it.
import * as transcript from '../../../../../engine/checks/helpers/session-transcript.mjs';

// A judge and the runner around it are spawned on EVERY tool call, prompt and
// result, so their wall-clock is a tax every session in every member pays, and a
// regression in one is invisible from the diff: the change reads correct and the
// cost lands somewhere nobody is looking. The measurement is cheap
// (dev/tools/hook-latency.mjs, ~10 iterations per payload class) and it only
// answers the question when it is taken on BOTH sides of the change, which is why
// the moment to demand it is while the session is still in front of the edit.
//
// WHAT IT READS. Two things at once, which is why this is code and not a
// declaration: the change's own files, and whether this session ever ran the
// tool. Neither alone is the condition.
//
// THE EVIDENCE IS GENEROUS ON PURPOSE. Any tool call whose input mentions the
// tool's module counts - the before-run and the after-run are one measurement to
// this rule, and it makes no claim about their order or their numbers. Reading a
// pair of tables against each other is the session's judgment; a false clear
// costs one unmeasured change, where a false finding would fire on every hook
// edit and be tuned out inside a week.
const CALL_HOOKS = /^engine\/hooks\/([a-z0-9-]+-judge|hook-runner)\.mjs$/;
const TOOL = 'dev/tools/hook-latency.mjs';
const MEASURED = /hook-latency\.mjs/;

const measuredInSession = (work) => {
  if (typeof work.toolCalls !== 'function') return true;
  return work.toolCalls().some((call) => MEASURED.test(JSON.stringify(call.input ?? {})));
};

const rule = {
  id: 'call-hook-latency-measured',
  // ADVISORY because the growth ladder sets that for a code rule an unattended run
  // wrote (claudinite-growth/extracting-lessons.md, rung 3): hand-written logic has
  // failure modes a declaration cannot have, and nobody reviewed this one. Promote it
  // once it has cleared a few real hook changes.
  on_fail: 'advise',
  since: '2026-09-27',
  scope: 'work',
  description: 'A change to a per-call hook judge or the hook runner is measured with dev/tools/hook-latency.mjs in the same session',
  doc: '.claudinite/local/packs/claudinite/RULES.md',
  why: 'these modules are spawned once per tool call, prompt and result, so a cost they add is paid by every session in every member and shows up nowhere in the diff - and a before-and-after measurement only exists while the session is still holding the change',

  run(work) {
    if (typeof transcript.toolCalls !== 'function') return [];
    const entries = work.sessionEntries?.() ?? [];
    if (!entries.length) return []; // CI and manual runs carry no transcript
    const touched = work.changedFiles.filter((f) => CALL_HOOKS.test(f));
    if (!touched.length || measuredInSession(work)) return [];
    return [finding(rule, {
      file: touched[0],
      what: `a per-call hook changed (${touched.join(', ')}) and this session never ran \`${TOOL}\``,
      fix: `run \`node ${TOOL}\` at this change and against the base, read the two tables against each other, and record the numbers in the element's retrospective brief`,
    })];
  },
};

export default rule;
