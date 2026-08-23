// The fleet-baseline DISPATCH — the enforcer's manual lever over the whole fleet:
// force every covered member to baseline NOW, instead of waiting for each one's next
// anchor. It dispatches each member's OWN scheduler with `wake: update` —
// the same button the owner would press in that repo's Actions tab, pressed across
// the fleet in one run. Nothing is baselined here: each member converges its own
// mount, with its own token, under its own scheduler and its own delivery policy.
// This is a dispatcher, not a maintainer — the fan-out model this pack runs both its
// write-shaped operations on (#749).
//
// IT FOLLOWS EACH MEMBER TO CURRENT (owner decision, #1293). A dispatch queues a run;
// reporting those queued runs reports this sweep's own outgoing calls rather than the
// fleet, and reads as delivery when it was not — #1292 recorded `13 fired, 0 failed`
// where 9 of the 13 took nothing. So the run's deliverable is the OUTCOME table: which
// members stamp canon's published engine and pack versions, which were already there,
// and which did not get there.
//
// This is not #649's 45-minute sleep returning. That was a blind fixed wait every run
// paid whatever the fleet was doing, and it forced the lever to be a standalone
// workflow. follow-to-current.mjs polls a real terminal condition instead, and each
// member leaves the loop the moment it reads current — an already-current fleet
// finishes on the first pass, in seconds, and the lever stays an ordinary manual task.
//
// WHY IT EXISTS. Under per-project scheduling every member baselines itself hourly,
// so the fleet needs no push in the ordinary case. The cases it is FOR are the
// un-ordinary ones: a canon change the fleet should pick up now rather than over the
// next day, and the tail of members whose next anchor is hours away. A wake clears
// the item's wait and re-readies it; the executor still evaluates the task's own
// precondition at pick, so a member with nothing to do converges to a cheap no-op —
// safe to over-use, only wasteful.
//
// THE TOKEN. FLEET_GITHUB_TOKEN, the same account-spanning PAT the sweeps use, plus
// ONE scope the read-only ones do not need: **Actions: read and write** on the
// owner's repositories. Dispatching another repo's workflow is a write to that
// repo's Actions, and a PAT scoped only for the sweeps gets a 403 here — reported
// per repo and failing the run, because it is a grant to fix once, not a transient.
//
// Dependency-free (global fetch, Node 20+). It writes NOTHING to any member — no
// commit, no issue, no comment; the single side effect per member is one queued
// Actions run.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  makeGh, paged, readDeclaration, isDormant, DECLARATION, SCHEDULER, fireScheduler,
} from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';
import { missingFleetTokenError } from '../../fleet-token.mjs';
import { classifyFreshness, probeMount, FRESH } from '../fleet-roster/drift-issues.mjs';
import {
  canonVersions, followToCurrent, isSuccess,
  ALREADY_CURRENT, CONVERGED, NEVER_STARTED, DID_NOT_CONVERGE, UNKNOWN,
} from './follow-to-current.mjs';

// The exact member-side task this lever forces — the id the member's scheduler run resolves
// against its own declared packs (`planWake` in engine/scheduler/queue/scheduler-run.mjs);
// named as a constant so the coupling is one line to find, not a string buried in a
// request body.
//
// `update` since Phase 5 (#768): the task this lever used to force no longer exists,
// and a lever that dispatches a task nothing will run reports a successful dispatch
// for a member that then does nothing — the exact "counts dispatches, not outcomes"
// blindness this sweep already has (Sheepdog#172). The task's own NAME is still the
// old vocabulary; renaming it is the fleet-wide update lever's work, not this line's.
export const FORCED_TASK = 'update';

// How long the follow will wait for the whole fleet to read current before giving up
// on whatever is left. Sized from what a member's update actually takes end to end —
// vendor, migrate, open the maintenance PR, auto-merge it, and on some members an
// agent apply stage after that — which was measured at 5–10 minutes, so the default
// leaves room for the slow tail without being a fixed wait anybody pays: every member
// leaves the loop the moment it reads current.
export const DEFAULT_FOLLOW_MINUTES = 20;

// The `REPOS` parameter, resolved against the owner: a space/whitespace-separated list
// of bare names or full `owner/name`, lowercased, or null for "every member". A bare
// name is qualified with the configured owner, because that is the only owner this
// sweep can reach and typing it twenty times is friction with no upside.
// Space-separated, never comma-separated — the parameter bag splits keys on commas.
export function parseRepoFilter(raw, owner) {
  const names = String(raw ?? '').split(/\s+/).map((s) => s.trim()).filter(Boolean);
  if (!names.length) return null;
  return new Set(names.map((n) => (n.includes('/') ? n : `${owner}/${n}`).toLowerCase()));
}

// Why a repo is out of this dispatch's scope BEFORE its declaration is even read —
// or null when it is in scope. Every branch lands in the report's skipped list,
// never a silent `continue`: the report enumerates the full fleet, and a fleet-wide
// force whose report names only the dispatched members reads as fleet-wide coverage
// when it was not. (Canon is skipped because its baselining self-skips — but the
// enforcer repo is NOT exempt: it is an ordinary member with a mount to converge,
// and leaving it out would make the one repo the owner is looking at the one repo
// that did not move.) Kept free of I/O so every branch is testable directly.
export function classifyScope(r, { canonRepo, exclude, filter }) {
  const fullName = r.full_name.toLowerCase();
  if (fullName === canonRepo.toLowerCase()) {
    return { state: 'canon', detail: 'canon has no vendored mount — forcing it would queue a run whose only outcome is its own self-skip' };
  }
  if (r.archived || r.fork) return { state: 'out-of-scope', detail: r.archived ? 'archived' : 'a fork' };
  if (exclude.has(fullName)) return { state: 'excluded', detail: "on the claudinite-fleet-sheepdog config's exclude list" };
  if (filter && !filter.has(fullName)) return { state: 'filtered-out', detail: "not in this run's REPOS filter" };
  return null;
}

// --- main ---------------------------------------------------------------------

export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw missingFleetTokenError('fleet-baseline',
      'The default GITHUB_TOKEN sees only this repo and cannot dispatch another repo\'s workflow.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const dryRun = String(process.env.FLEET_BASELINE_DRY_RUN ?? '').toLowerCase() === 'true';
  const includeDormant = String(process.env.FLEET_BASELINE_INCLUDE_DORMANT ?? '').toLowerCase() === 'true';

  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the claudinite-fleet-sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, exclude, canonRepo } = parseSheepdogConfig(cfg, home);
  const filter = parseRepoFilter(process.env.FLEET_BASELINE_REPOS, owner);
  // One reader for the whole sweep: it memoizes canon's engine version and each
  // pack's, so canon is read once per distinct pack rather than once per member.
  const canon = canonVersions(gh, canonRepo);
  const followMinutes = Number(process.env.FLEET_BASELINE_FOLLOW_MINUTES) || DEFAULT_FOLLOW_MINUTES;

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope`);
  }

  const fired = []; const skipped = []; const failed = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    // Out of scope before the declaration is read — canon, archived, a fork, excluded,
    // or filtered out. classifyScope says why, and each lands in the skipped list: no
    // repo leaves this report silently, whatever its state.
    const scope = classifyScope(r, { canonRepo, exclude, filter });
    if (scope) { skipped.push({ fullName, ...scope }); continue; }

    let decl;
    try {
      decl = await readDeclaration(gh, r.full_name);
    } catch (e) {
      // Unreadable is not uncovered: a repo whose declaration could not be read might be
      // a member that needed this run, so it is a FAILURE to escalate, never a silent skip.
      failed.push({ fullName, state: 'error', detail: `could not read ${DECLARATION}: ${e.message}` });
      continue;
    }
    if (decl === null) {
      skipped.push({ fullName, state: 'uncovered', detail: `no tracked ${DECLARATION} — adoption is the census's business, and there is nothing there to baseline` });
      continue;
    }
    if (isDormant(decl) && !includeDormant) {
      // A dormant member stopped its own scheduler; a forced dispatch on it either does
      // nothing (the run stops before evaluating anything) or wakes a repo that asked to
      // sleep. Reported, not silently dropped, so a fleet-wide force is never mistaken
      // for fleet-wide coverage.
      skipped.push({ fullName, state: 'dormant', detail: 'self-declared dormant — pass INCLUDE_DORMANT=true to force it anyway' });
      continue;
    }

    if (dryRun) {
      fired.push({ fullName, state: 'would-fire', detail: `would dispatch ${SCHEDULER}@${r.default_branch} to wake ${FORCED_TASK}` });
      continue;
    }
    // BEFORE firing, not after: a member already at canon's versions declines its own
    // update and never does any work, and only a reading taken before the dispatch can
    // tell that success apart from a member that converged because of it. The
    // declaration is already in hand, so this costs the mount probe alone.
    let wasFresh = false;
    try {
      wasFresh = classifyFreshness(await probeMount(gh, r.full_name, decl, { canon })).state === FRESH;
    } catch {
      // Unreadable here is not a failure to dispatch. It only means this member's
      // success will be reported as `converged` rather than `already-current`, which
      // is the conservative way round: it claims no more than was observed.
      wasFresh = false;
    }
    const firedAt = new Date().toISOString();
    const verdict = await fireScheduler(gh, r.full_name, r.default_branch, FORCED_TASK);
    if (verdict.state !== 'fired') { failed.push({ fullName, ...verdict }); continue; }
    fired.push({ fullName, ...verdict, firedAt, wasFresh });
  }

  // THE FOLLOW. Everything above queued runs; this is what turns that into an answer
  // about the FLEET. Skipped for a dry run, which dispatched nothing and therefore has
  // no outcome to wait for.
  const followed = dryRun || fired.length === 0 ? [] : await followToCurrent(gh, fired, {
    canon,
    readDeclaration,
    budgetMs: followMinutes * 60_000,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line),
  });

  const summary = renderBaselineReport({ owner, dryRun, filter, fired, followed, skipped, failed });
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  const problem = runVerdict({ fired, followed, failed });
  if (problem) throw new Error(problem);
}

const runsUrl = (n) => `https://github.com/${n}/actions/workflows/${SCHEDULER}`;

// Each outcome gets its own section, because each is a different thing for the reader
// to do — and because collapsing `already-current` into the successes without naming
// it would hide the single most useful fact a run can report: that a member needed
// nothing. Ordered as the reader wants them: what moved, what was fine, then what to
// go and fix.
export const OUTCOME_SECTIONS = [
  [CONVERGED, 'Converged during this run', 'was behind canon and is now at its versions'],
  [ALREADY_CURRENT, 'Already current', "was at canon's versions before the dispatch, so its own update correctly declined"],
  [DID_NOT_CONVERGE, 'Started but did not reach canon', 'its scheduler ran — go and read it'],
  [NEVER_STARTED, 'Never started', 'the dispatch was accepted and no run followed it'],
  [UNKNOWN, 'Could not be determined', 'the member could not be read'],
];

// The whole report, pure over what the sweep observed — so what it CLAIMS is testable
// without a fleet. The headline count is `current of dispatched`, never a count of
// dispatches: a table whose big number is "13 fired" is the thing #1292 caught.
export function renderBaselineReport({ owner, dryRun, filter, fired, followed, skipped, failed }) {
  const current = followed.filter((f) => isSuccess(f.outcome));
  const notCurrent = followed.filter((f) => !isSuccess(f.outcome));
  const section = ([state, heading, gloss]) => {
    const rows = followed.filter((f) => f.outcome === state);
    return rows.length
      ? `**${heading}** — ${gloss}:\n${rows.map((f) => `- [\`${f.fullName}\`](${runsUrl(f.fullName)}) — ${f.detail}`).join('\n')}`
      : '';
  };

  return [
    `# Fleet baseline — ${owner}${dryRun ? ' (DRY RUN — nothing was dispatched)' : ''}`,
    '',
    dryRun
      ? `Would ask each covered member's own \`${SCHEDULER}\` to wake its \`${FORCED_TASK}\` item.`
      : `Asked each covered member's own \`${SCHEDULER}\` to wake its \`${FORCED_TASK}\` item, then followed each`
        + ` one until its own \`${DECLARATION}\` stamped the engine and every declared pack at the versions canon publishes.`,
    filter ? `Filtered to: ${[...filter].join(', ')}` : '',
    '',
    dryRun
      ? `| would fire | skipped |\n| --- | --- |\n| ${fired.length} | ${skipped.length} |`
      : `| current | not current | not dispatched | skipped |\n| --- | --- | --- | --- |\n`
        + `| ${current.length} of ${fired.length} | ${notCurrent.length} | ${failed.length} | ${skipped.length} |`,
    '',
    dryRun && fired.length
      ? `**Would fire:**\n${fired.map((f) => `- [\`${f.fullName}\`](${runsUrl(f.fullName)})`).join('\n')}`
      : '',
    !dryRun && !fired.length && !failed.length
      ? '**No member was dispatched** — check the filter, or whether anything under this owner is covered.'
      : '',
    ...OUTCOME_SECTIONS.map(section),
    skipped.length ? `**Skipped:**\n${skipped.map((s) => `- \`${s.fullName}\` — **${s.state}**: ${s.detail}`).join('\n')}` : '',
    failed.length ? `**Could not be dispatched:**\n${failed.map((f) => `- \`${f.fullName}\` — **${f.state}**: ${f.detail}`).join('\n')}` : '',
    '',
    // Said plainly rather than left to inference: "current" is a statement about
    // PUBLISHED VERSION NUMBERS. Canon content that shipped without a version bump
    // moves no number, so a member can read current and still lack it (#1292).
    "_Current means the member stamps canon's published engine and pack versions. Canon content_",
    '_that shipped without a version bump moves no number, so it is invisible here._',
  ].filter(Boolean).join('\n');
}

// What fails the run, in the order a reader should act on it — or null when the fleet
// is current. A dispatch that never landed is a grant or an adoption to fix. A member
// that WAS dispatched and is still not current is the failure this whole follow exists
// to surface: the one the old report counted as a success. Everything observed is
// printed before this is consulted, so a throw ends the run without withdrawing the
// report. Pure, so the escalation policy is testable without a fleet.
export function runVerdict({ fired, followed, failed }) {
  if (failed.length) {
    return `${failed.length} member(s) could not be dispatched (${failed.map((f) => `${f.fullName}: ${f.state}`).join('; ')}) — `
      + 'the rest are reported above, and this run fails so the cause is escalated';
  }
  const notCurrent = followed.filter((f) => !isSuccess(f.outcome));
  if (notCurrent.length) {
    return `${notCurrent.length} of ${fired.length} dispatched member(s) did not reach canon's versions `
      + `(${notCurrent.map((f) => `${f.fullName}: ${f.outcome}`).join('; ')}) — `
      + 'reported above, and this run fails rather than counting the dispatch as the outcome';
  }
  return null;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-baseline failed: ${e.message}`); process.exit(1); });
}
