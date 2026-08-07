// The sheepdog force-baseline sweep's FOLLOW half — what turns a fire-and-forget
// dispatcher into a run that ends when the fleet has actually converged.
//
// WHY IT EXISTS. `force-fleet-baseline.mjs` presses each member's button and, until
// this file, stopped there: a 204 means QUEUED, not baselined, so the sweep went green
// while thirteen members were still cloning canon — and the owner's only way to learn
// what the force achieved was to open thirteen Actions tabs and thirteen PR lists. The
// owner presses this lever precisely on the occasions they are standing by to watch the
// result (a broken vendored file, a migration that must land now), which is exactly when
// "queued" is the least useful thing a run can report. So the sweep now WATCHES: each
// dispatched member is followed to a terminal state and the run ends when the last one
// gets there.
//
// WHAT "ENDED" MEANS, and why it is not "the member's Actions run went green". A member
// baselines in up to three acts, and only the first is that run:
//   1. the deterministic converge (the scheduler run itself — worker.mjs), which opens
//      the per-cycle maintenance PR;
//   2. the AGENT, when the worker requested one (a pending agentic migration note, or a
//      converge left non-green) — it runs OUTSIDE that Actions run, triggered by the
//      `ready-for-agent` dispatch issue, and pushes further commits to the same PR;
//   3. the PR LANDING — auto-merge waits on that repo's own CI, which finishes minutes
//      after the run that armed it.
// A sweep that stopped at (1) would call an agentic night finished while the agent had
// not yet started. So the terminal test is read off the PR and the dispatch issue, not
// off the run: converged (PR merged), no-change (nothing to deliver), open-for-review (a
// `review`-delivery member's PR, which is the owner's to merge and never this sweep's to
// wait on), or a failure. `settle()` is that whole table, pure.
//
// WHAT IT COLLECTS, per member, because the summary is the deliverable: the canon ref the
// member was stamped at BEFORE and AFTER (the "new version" of a Claudinite member is the
// canon commit its mount is stamped at — there is no other version number), the lines and
// files the maintenance PR changed, how long the member took, every error and warning
// GitHub recorded against the run, and whether an agent was involved.
//
// WHY ANNOTATIONS AND NOT LOGS, for the errors-and-warnings column. A run's raw logs are
// a zip per job and tens of thousands of lines of noise, and grepping them for /error/i
// would report the word, not the fact. GitHub's own structured record of what went wrong
// in a run is its ANNOTATIONS (a job id is also a check-run id), plus the conclusions of
// the individual steps. That is what this reads: failures and warnings the platform
// itself recorded, never a text scrape. A member whose run says something a human needs
// to read in full is linked, not summarized.
//
// Dependency-free (global fetch, Node 20+), and READ-ONLY — every write this sweep makes
// is the dispatch in force-fleet-baseline.mjs. The clock and the sleep are injected so
// the whole loop is testable without a network or a wall-clock wait.

import {
  DECLARATION, readDeclaration,
} from '../fleet-api.mjs';

// The member-side artifacts this file recognizes. All three are another component's
// public surface, so each is named once, here, with a pointer to its owner — a string
// buried in a filter is a coupling nobody finds when the owner changes it.
export const MAINT_PREFIX = 'claudinite/maintenance';                 // baselining worker.mjs deliver()
export const AGENT_ISSUE_PREFIX = '[claudinite-task] basics/baselining'; // engine/scheduler/dispatch.mjs dispatchTitle()
export const READY_LABELS = new Set(['ready-for-agent', 'ready-for-agent-fleet']); // dispatch.mjs

// How often the sweep asks each member how it is doing, and how long it will wait before
// calling the fleet unfinished. The poll is unhurried on purpose: nothing here is
// latency-sensitive, and a fleet-sized poll every few seconds is a rate-limit bill paid
// for no information. The default deadline is sized for the slow case that is still
// NORMAL — an agentic night on a member whose CI takes a while — not for the fastest one.
export const DEFAULT_POLL_MS = 20_000;
export const DEFAULT_FOLLOW_MINUTES = 45;

// Clock skew between this runner and GitHub's timestamps. Every "did this appear AFTER I
// dispatched?" test is widened by it, because the alternative failure is silent and
// nasty: a PR opened one second before our clock says we dispatched is dropped, and the
// member reports `no-change` on the cycle it actually converged.
const SKEW_MS = 120_000;

// --- pure: inputs -------------------------------------------------------------

// The follow deadline, in minutes, from the workflow input. Junk and zero fall back to
// the default rather than failing the run — the sweep's job is to baseline the fleet, and
// refusing to start over a malformed number would trade the whole operation for a typo.
export function parseFollowMinutes(raw, fallback = DEFAULT_FOLLOW_MINUTES) {
  const n = Number(String(raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// A boolean workflow input. GitHub hands `type: boolean` inputs to env as the strings
// 'true'/'false', and an unset input as ''.
export const asBool = (raw, dflt = false) => {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return dflt;
};

// How this member's maintenance PR is meant to land, read from its own declaration. Only
// two answers matter here and only one distinction is load-bearing: a `review` member's
// PR is the OWNER'S to merge, on their own clock, so an open PR is that member's terminal
// state — waiting for it would hang the sweep until the deadline every single time. The
// aliases are the permanent ones the baselining worker accepts (`push`/`auto`, `pr`);
// anything unrecognized reads as the default, because this file only decides how long to
// wait and has no standing to fail a member over a value the member's own run accepted.
export function deliveryOf(decl) {
  const v = String(decl?.maintenance?.delivery ?? '').trim().toLowerCase();
  return (v === 'review' || v === 'pr') ? 'review' : 'auto-merge';
}

// The canon commit a member's mount is stamped at — the closest thing a Claudinite member
// has to a version, and what "did this force change anything" is measured on.
export const stampedRef = (decl) => decl?.claudinite?.ref ?? null;

export const shortRef = (ref) => (ref ? String(ref).slice(0, 7) : '—');

// --- pure: what the member is doing -------------------------------------------

// THE dispatched run, out of the workflow's recent runs. Identified by BOTH bounds and
// deliberately so: `afterRunId` (the newest run id seen immediately before the dispatch)
// is the precise test, and the timestamp is the fallback for the case it cannot cover —
// a member with no prior run at all, where there is no id to be newer than. Run ids
// increase monotonically within a repo, so "greater than the last one we saw" is exactly
// "created since we looked".
//
// Oldest-first among the candidates, because a member whose hourly slot fired seconds
// after our dispatch has two new runs and OURS is the earlier one. Returns null while
// GitHub has not yet materialized the run — a dispatch POST returns 204 before the run
// is queryable, which is a wait, not a failure.
export function pickDispatchedRun(runs, { afterRunId = null, sinceMs = null } = {}) {
  const fresh = (runs ?? []).filter((r) => {
    if (!r || typeof r.id !== 'number') return false;
    if (afterRunId != null && r.id <= afterRunId) return false;
    if (sinceMs != null) {
      const t = Date.parse(r.created_at ?? '');
      if (Number.isFinite(t) && t < sinceMs - SKEW_MS) return false;
    }
    return true;
  });
  if (!fresh.length) return null;
  return fresh.sort((a, b) => a.id - b.id)[0];
}

// How long a run took, from its own timestamps. `run_started_at` is when the runner
// picked it up; `updated_at` on a completed run is when it finished. Null rather than 0
// when either is missing — a duration nobody can compute must read as unknown in the
// summary, not as instant.
export function runDurationMs(run) {
  const start = Date.parse(run?.run_started_at ?? run?.created_at ?? '');
  const end = Date.parse(run?.updated_at ?? '');
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
}

// THE TERMINAL TEST — the whole "when is this member done" table, pure, over the three
// observations the poller makes (the run, the maintenance PR, the agent's dispatch issue)
// plus the member's declared delivery.
//
// Ordering is the argument:
//   - no run yet / still running → wait. Nothing downstream exists to read.
//   - the run failed → DONE, and failed. The member escalates that itself (its scheduler
//     files a `workflow-failure` issue); this sweep reports it and stops waiting for a PR
//     that is never coming.
//   - an OPEN agent dispatch issue → wait. This is the case the whole file exists for:
//     the Actions run is green and finished, and the actual baselining has not started.
//     The issue is filed DURING the run (the scheduler files it before the run ends), so
//     by the time we read `completed` it is already there — there is no window in which a
//     pending agent looks like no agent.
//   - no PR → done. The converge found nothing to deliver (the ordinary quiet night), or
//     the agent ran and left nothing behind, which are different enough to name apart.
//   - merged → converged, the outcome the lever was pulled for.
//   - closed unmerged → done, and reported: baselining closes a PR its own CI went red on.
//   - open + `review` → done. That PR is the owner's; see deliveryOf().
//   - open + `auto-merge` → wait for the arm to land it.
export function settle({ run, pull, agent, delivery }) {
  if (!run) return { done: false, state: 'awaiting-run', detail: 'the dispatched run has not appeared yet' };
  if (run.status !== 'completed') return { done: false, state: 'running', detail: `the member scheduler run is ${run.status}` };
  if (run.conclusion !== 'success') {
    return { done: true, ok: false, state: 'run-failed', detail: `the member scheduler run concluded \`${run.conclusion}\` — that repo files its own workflow-failure issue` };
  }
  if (agent?.state === 'open') {
    return { done: false, state: 'agent-working', detail: `agentic baselining in flight (issue #${agent.number})` };
  }
  if (!pull) {
    return agent
      ? { done: true, ok: true, state: 'agent-no-pr', detail: `an agent ran (issue #${agent.number}) and left no maintenance PR` }
      : { done: true, ok: true, state: 'no-change', detail: 'converged with nothing to deliver — the mount was already current' };
  }
  if (pull.merged) return { done: true, ok: true, state: 'converged', detail: `maintenance PR #${pull.number} merged` };
  if (pull.state === 'closed') {
    return { done: true, ok: false, state: 'pr-closed', detail: `maintenance PR #${pull.number} was closed unmerged — baselining closes a PR whose CI did not pass` };
  }
  if (delivery === 'review') {
    return { done: true, ok: true, state: 'open-for-review', detail: `maintenance PR #${pull.number} is open — this member delivers by review, so merging it is the owner's call` };
  }
  // Not "waiting on auto-merge": whether an arm exists is the member's own
  // delivery decision (its base may queue nothing), and this observer cannot
  // see it — say only what is true from here.
  return { done: false, state: 'pr-open', detail: `maintenance PR #${pull.number} is open — not yet landed` };
}

// What the deadline turns an unfinished member into. Not a silent drop and not a bare
// "timeout": the state it was still in is the whole diagnosis (a member stuck at
// `agent-working` is a slow agent; one stuck at `awaiting-run` never started).
export function timedOut(verdict, minutes) {
  return {
    done: true,
    ok: false,
    state: 'timed-out',
    detail: `still \`${verdict?.state ?? 'unknown'}\` after ${minutes} minutes — ${verdict?.detail ?? 'no progress observed'}`,
  };
}

// GitHub's own record of what went wrong in a run, split by level. `notice` is dropped:
// it is the level the platform uses for informational output, and a summary that lists
// notices as findings trains the reader to skim the column that matters.
export function splitAnnotations(annotations) {
  const of = (level) => (annotations ?? [])
    .filter((a) => a?.annotation_level === level)
    .map((a) => ({ path: a.path ?? null, title: a.title ?? null, message: String(a.message ?? '').trim() }));
  return { errors: of('failure'), warnings: of('warning') };
}

// A failed STEP is an error too, and one annotations often miss — a step that exits
// non-zero without emitting a `::error::` produces no annotation at all, so a run that
// went red would otherwise show an empty error column. Named by job/step so the reader
// knows where to look.
export function failedSteps(jobs) {
  const out = [];
  for (const j of jobs ?? []) {
    for (const s of j.steps ?? []) {
      if (['failure', 'timed_out', 'cancelled'].includes(s?.conclusion)) {
        out.push({ path: null, title: `${j.name} › ${s.name}`, message: `step concluded ${s.conclusion}` });
      }
    }
  }
  return out;
}

// --- I/O ----------------------------------------------------------------------

// The newest run id on a member's scheduler, read BEFORE the dispatch so the run this
// sweep starts can be told from the one its hourly cron started a minute earlier. Null
// when the member has never run this workflow (then the timestamp bound does the work).
export async function latestRunId(gh, fullName, workflow) {
  const { status, json } = await gh(`/repos/${fullName}/actions/workflows/${workflow}/runs?per_page=1`);
  if (status !== 200 || !Array.isArray(json?.workflow_runs)) return null;
  return json.workflow_runs[0]?.id ?? null;
}

// The dispatched run, or null while it has not appeared. Filtered to
// `event=workflow_dispatch` so a scheduled run that fires mid-follow is never mistaken
// for ours — the id/time bounds would usually exclude it anyway, but the event is the
// direct statement and costs nothing.
export async function findRun(gh, fullName, workflow, bounds) {
  const { status, json } = await gh(`/repos/${fullName}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=20`);
  if (status !== 200 || !Array.isArray(json?.workflow_runs)) return null;
  return pickDispatchedRun(json.workflow_runs, bounds);
}

export async function readRun(gh, fullName, runId) {
  const { status, json } = await gh(`/repos/${fullName}/actions/runs/${runId}`);
  return status === 200 ? json : null;
}

// This cycle's maintenance PR: the newest PR on a `claudinite/maintenance-*` head branch
// opened since the dispatch. `state=all` because the interesting outcomes are the closed
// ones — merged (the win) and closed-unmerged (the failure worth reporting).
export async function findMaintenancePull(gh, fullName, sinceMs) {
  const { status, json } = await gh(`/repos/${fullName}/pulls?state=all&sort=created&direction=desc&per_page=20`);
  if (status !== 200 || !Array.isArray(json)) return null;
  const hit = json.find((p) => String(p?.head?.ref ?? '').startsWith(MAINT_PREFIX)
    && Date.parse(p?.created_at ?? '') >= sinceMs - SKEW_MS);
  if (!hit) return null;
  // The list payload carries no diff stats; the detail read is what has additions,
  // deletions, changed_files and merge_commit_sha. One extra request per member per poll
  // is the price of the lines-changed column the owner asked for.
  const det = await gh(`/repos/${fullName}/pulls/${hit.number}`);
  const p = det.status === 200 && det.json ? det.json : hit;
  return {
    number: p.number,
    state: p.state,
    merged: Boolean(p.merged_at),
    mergedAt: p.merged_at ?? null,
    mergeCommitSha: p.merged_at ? (p.merge_commit_sha ?? null) : null,
    additions: typeof p.additions === 'number' ? p.additions : null,
    deletions: typeof p.deletions === 'number' ? p.deletions : null,
    changedFiles: typeof p.changed_files === 'number' ? p.changed_files : null,
    url: p.html_url ?? `https://github.com/${fullName}/pull/${p.number}`,
  };
}

// The baselining dispatch issue this cycle filed, if any — the ONE unambiguous signal
// that agentic work was requested (the worker writes CLAUDINITE_REQUEST_AGENT, the
// scheduler files this issue, the executor closes it when the agent is done). Its
// presence answers "was there agentic work"; its state answers "is it finished".
export async function findAgentIssue(gh, fullName, sinceMs) {
  const { status, json } = await gh(`/repos/${fullName}/issues?state=all&sort=created&direction=desc&per_page=30`);
  if (status !== 200 || !Array.isArray(json)) return null;
  const hit = json.find((i) => !i?.pull_request
    && String(i?.title ?? '').startsWith(AGENT_ISSUE_PREFIX)
    && Date.parse(i?.created_at ?? '') >= sinceMs - SKEW_MS);
  if (!hit) return null;
  const labels = (hit.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
  return {
    number: hit.number,
    state: hit.state,
    ready: labels.some((l) => READY_LABELS.has(l)),
    url: hit.html_url ?? `https://github.com/${fullName}/issues/${hit.number}`,
  };
}

// Everything GitHub recorded as wrong with the run: annotations per job (a job id IS a
// check-run id — that is the only route from a run to its annotations) plus any step that
// concluded non-green. Best-effort by construction: a member whose jobs cannot be read
// still reports its baselining outcome, it just reports no findings, which is why the
// summary says "recorded" rather than "none".
export async function collectFindings(gh, fullName, runId) {
  const { status, json } = await gh(`/repos/${fullName}/actions/runs/${runId}/jobs?per_page=50`);
  if (status !== 200 || !Array.isArray(json?.jobs)) return { errors: [], warnings: [] };
  const jobs = json.jobs;
  const all = [];
  for (const j of jobs) {
    const res = await gh(`/repos/${fullName}/check-runs/${j.id}/annotations`);
    if (res.status === 200 && Array.isArray(res.json)) all.push(...res.json);
  }
  const { errors, warnings } = splitAnnotations(all);
  return { errors: [...errors, ...failedSteps(jobs)], warnings };
}

// --- the follow loop ----------------------------------------------------------

// One poll of one member: refresh what can still change, then re-run the terminal test.
// Ordered cheapest-first and short-circuited — a member that has not produced a run yet
// has no PR and no dispatch issue to look for, so those requests are not made.
export async function pollMember(gh, w, workflow) {
  if (!w.run) {
    const run = await findRun(gh, w.fullName, workflow, { afterRunId: w.afterRunId, sinceMs: w.dispatchedAtMs });
    if (run) { w.run = run; w.runUrl = run.html_url ?? null; }
  } else if (w.run.status !== 'completed') {
    w.run = (await readRun(gh, w.fullName, w.run.id)) ?? w.run;
  }
  if (w.run?.status === 'completed') {
    // Both are re-read every poll after the run completes, not once: the PR lands
    // minutes later (auto-merge waits on CI) and the agent issue closes later still.
    w.pull = await findMaintenancePull(gh, w.fullName, w.dispatchedAtMs);
    w.agent = await findAgentIssue(gh, w.fullName, w.dispatchedAtMs);
  }
  w.verdict = settle({ run: w.run, pull: w.pull, agent: w.agent, delivery: w.delivery });
  return w.verdict;
}

// What a member is worth reporting once it stops moving: the findings from its run and
// the ref its declaration now carries. Read ONCE, at the end, because both are answers
// only the finished state can give — a stamp read mid-run reports the old one.
export async function finalize(gh, w, workflow) {
  if (w.run?.id) {
    const found = await collectFindings(gh, w.fullName, w.run.id);
    w.errors = found.errors;
    w.warnings = found.warnings;
  }
  try {
    w.afterRef = stampedRef(await readDeclaration(gh, w.fullName));
  } catch (e) {
    // A declaration that cannot be read at the end is a finding, not a crash: everything
    // else observed about this member is still true and still worth reporting.
    w.warnings = [...(w.warnings ?? []), { path: DECLARATION, title: 'stamp unreadable', message: e.message }];
    w.afterRef = null;
  }
  w.durationMs = runDurationMs(w.run) ?? null;
  return w;
}

// Follow every dispatched member to a terminal state, or to the deadline. Sequential
// within a round and unhurried between rounds — a fleet is ~a dozen members, the work is
// waiting rather than computing, and a parallel fan-out would buy seconds at the cost of
// a rate-limit budget the sweep has no other use for.
//
// `now` and `sleep` are injected so the whole loop is exercised in tests at full speed;
// `log` is how progress reaches the Action log as it happens rather than only in the
// final summary — the owner is watching this run, and a 40-minute silence is not a report.
export async function followFleet(gh, watches, {
  workflow, pollMs = DEFAULT_POLL_MS, minutes = DEFAULT_FOLLOW_MINUTES,
  now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log,
} = {}) {
  const deadline = now() + minutes * 60_000;
  const startedAt = now();
  for (;;) {
    for (const w of watches) {
      if (w.verdict?.done) continue;
      const before = w.verdict?.state ?? null;
      let verdict;
      try {
        verdict = await pollMember(gh, w, workflow);
      } catch (e) {
        // A transient read failure must not end the follow: the member is still
        // baselining whether or not we could ask about it this round. Recorded so a
        // member that NEVER answers still shows why in its warnings.
        w.pollErrors = (w.pollErrors ?? 0) + 1;
        w.lastPollError = e.message;
        continue;
      }
      if (verdict.state !== before) log(`fleet-baseline: ${w.fullName} — ${verdict.state}: ${verdict.detail}`);
      if (verdict.done) {
        await finalize(gh, w, workflow);
        log(`fleet-baseline: ${w.fullName} finished (${verdict.state})`
          + `${w.pull ? `, PR #${w.pull.number} +${w.pull.additions ?? '?'}/-${w.pull.deletions ?? '?'}` : ''}`
          + `${w.agent ? ', agentic' : ''}`);
      }
    }
    if (watches.every((w) => w.verdict?.done)) break;
    if (now() >= deadline) {
      for (const w of watches) {
        if (w.verdict?.done) continue;
        w.verdict = timedOut(w.verdict, minutes);
        log(`fleet-baseline: ${w.fullName} — ${w.verdict.detail}`);
        await finalize(gh, w, workflow);
      }
      break;
    }
    await sleep(pollMs);
  }
  return { watches, elapsedMs: now() - startedAt };
}

// --- the report ---------------------------------------------------------------

export function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Whether a member's mount actually MOVED. The distinction the summary leads with: a
// forced run on an already-current member is a cheap no-op by design, and a report that
// listed it beside a member that converged twelve commits would bury the thing the owner
// pulled the lever to see.
export const didUpdate = (w) => Boolean(w.afterRef && w.beforeRef && w.afterRef !== w.beforeRef)
  || Boolean(w.pull?.merged);

// One row of the fleet table. Kept pure and separate from the assembly below so the
// column semantics are testable without building a whole report.
export function memberRow(w) {
  const ref = w.beforeRef === w.afterRef
    ? shortRef(w.afterRef)
    : `${shortRef(w.beforeRef)} → **${shortRef(w.afterRef)}**`;
  const lines = w.pull && (w.pull.additions != null || w.pull.deletions != null)
    ? `+${w.pull.additions ?? 0}/-${w.pull.deletions ?? 0} (${w.pull.changedFiles ?? '?'}f)`
    : '—';
  const findings = [(w.errors ?? []).length ? `${w.errors.length}✗` : '', (w.warnings ?? []).length ? `${w.warnings.length}⚠` : '']
    .filter(Boolean).join(' ') || '—';
  const pr = w.pull ? `[#${w.pull.number}](${w.pull.url})` : '—';
  return `| [\`${w.fullName}\`](${w.runUrl ?? `https://github.com/${w.fullName}/actions`}) | ${w.verdict?.state ?? 'unknown'} | ${ref} | ${lines} | ${humanDuration(w.durationMs)} | ${w.agent ? `yes ([#${w.agent.number}](${w.agent.url}))` : 'no'} | ${pr} | ${findings} |`;
}

// The findings section — every error and warning the fleet recorded, per member, in full.
// NOT truncated to a count: the count is in the table, and the reason this section exists
// is that a count nobody can act on is what sent the owner to thirteen Actions tabs.
export function findingsSection(watches) {
  const withFindings = watches.filter((w) => (w.errors ?? []).length || (w.warnings ?? []).length);
  if (!withFindings.length) return '';
  const one = (f, mark) => `  - ${mark} ${[f.title, f.path].filter(Boolean).join(' — ')}${f.title || f.path ? ': ' : ''}${f.message.split('\n')[0]}`;
  return ['**Errors and warnings recorded during the run:**', ...withFindings.map((w) => [
    `- \`${w.fullName}\``,
    ...(w.errors ?? []).map((f) => one(f, '✗')),
    ...(w.warnings ?? []).map((f) => one(f, '⚠')),
  ].join('\n'))].join('\n');
}

// The outcome report. A DRY RUN renders the same document with the same columns and
// honest zeros rather than skipping it: the report is the thing the owner is about to
// rely on, and the only run where they can inspect its shape before trusting it is the
// one that changes nothing. A dry run that printed a different, shorter summary would
// leave the real report untested until the night it mattered.
export function renderFollowReport(watches, elapsedMs, minutes, { dryRun = false } = {}) {
  const updated = watches.filter(didUpdate);
  const agentic = watches.filter((w) => w.agent);
  const bad = watches.filter((w) => w.verdict?.ok === false);
  const totalAdd = watches.reduce((n, w) => n + (w.pull?.additions ?? 0), 0);
  const totalDel = watches.reduce((n, w) => n + (w.pull?.deletions ?? 0), 0);
  const errs = watches.reduce((n, w) => n + (w.errors ?? []).length, 0);
  const warns = watches.reduce((n, w) => n + (w.warnings ?? []).length, 0);

  return [
    '',
    `## Baselining outcome — followed to completion (${humanDuration(elapsedMs)})`,
    '',
    dryRun
      ? 'DRY RUN — nothing was dispatched, so nothing was followed. Every figure below is a'
        + ' true zero, and the columns are exactly the ones a real run fills in.'
      : `Followed ${watches.length} dispatched member(s) until each reached a terminal state`
        + ` (PR merged, nothing to deliver, or left open for review), with a ${minutes}-minute deadline.`,
    '',
    `| updated | unchanged | agentic | failed/timed out | lines | errors | warnings |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${updated.length} | ${watches.length - updated.length} | ${agentic.length} | ${bad.length} | +${totalAdd}/-${totalDel} | ${errs} | ${warns} |`,
    '',
    '| member | outcome | canon ref | lines | run time | agentic | PR | findings |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...(watches.length ? watches.map(memberRow) : ['| _none_ | — | — | — | — | — | — | — |']),
    '',
    dryRun ? '_A dry run dispatches nothing, so there is no run, no PR and no stamp to read._' : '',
    updated.length
      // Both refs spelled out, old first. The new one alone says where the member is; the
      // PAIR says what the force actually did, and the old ref is what a rollback or a
      // "what changed under us" diff is taken against (`git log old..new` in canon).
      ? `**Updated:**\n${updated.map((w) => `- \`${w.fullName}\`: \`${shortRef(w.beforeRef)}\` → \`${shortRef(w.afterRef)}\``
        + `${w.pull ? ` (PR #${w.pull.number}, +${w.pull.additions ?? 0}/-${w.pull.deletions ?? 0} across ${w.pull.changedFiles ?? '?'} file(s))` : ''}`
        + `${w.agent ? ' — agentic' : ''}`).join('\n')}`
      : (dryRun
        ? '**No member changed** — by construction: a dry run makes no change to report.'
        : '**No member changed** — every one of them was already at canon head, which is what a forced run on a current fleet looks like.'),
    '',
    findingsSection(watches),
    '',
    bad.length
      ? `**Did not finish cleanly:**\n${bad.map((w) => `- \`${w.fullName}\` — **${w.verdict.state}**: ${w.verdict.detail}`).join('\n')}`
      : '',
  ].filter((l) => l !== '').join('\n');
}
