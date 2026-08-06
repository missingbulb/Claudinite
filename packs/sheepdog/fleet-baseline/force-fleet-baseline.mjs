#!/usr/bin/env node
// The sheepdog pack's FORCE-BASELINE sweep — the enforcer's one manual lever over the
// whole fleet. Run by the pack's `fleet-baseline` workflow (stubs/workflows/fleet-baseline.yml,
// vendored into the enforcer repo's own .github/ by the `sheepdog-fleet-baseline` migration),
// on `workflow_dispatch` only. Still runnable by hand (`node force-fleet-baseline.mjs`) via
// the CLI guard at the foot.
//
// WHAT IT DOES. Enumerate every covered member under the configured owner and, for each,
// fire ITS OWN scheduler workflow with `overrides: FORCE_TASKS=baselining` — the same
// manual-run lever the owner would pull by hand in that repo's Actions tab, pulled across
// the fleet in one run. Nothing here re-implements baselining: each member converges its
// own mount, with its own token, under its own scheduler and its own delivery policy. This
// sweep only presses the button, which is why it is a dispatcher and not a maintainer.
//
// AND THEN IT WATCHES. Dispatching is half the job: a 204 means QUEUED, and the owner
// pulls this lever exactly on the occasions they are standing by for the RESULT. So the
// run does not end at the last dispatch — it follows every member it forced until that
// member reaches a terminal state (its maintenance PR merged, or nothing to deliver, or a
// PR left open for a `review` member to merge), including the nights where the converge
// hands off to an AGENT that runs outside the member's Actions run entirely. That half
// lives in follow-fleet-baseline.mjs, beside this file: what it observes, when a member
// counts as finished, and the report it renders (updated members with their OLD and new
// canon refs, lines changed, per-member timing, errors and warnings, whether an agent was
// involved). Set the `follow` input false for the old fire-and-forget behaviour.
//
// WHY IT EXISTS. Under per-project scheduling every member baselines itself hourly, so the
// fleet needs no push in the ordinary case. The cases it is FOR are the un-ordinary ones:
// a canon change the fleet should pick up now rather than over the next day (a broken
// vendored file, a migration record that must land before something else), and the tail of
// members whose next slot is hours away when someone is standing by to watch the result.
// A forced run bypasses baselining's precondition (the engine records it as forced and says
// the precondition was never evaluated), so a member with nothing to do converges to a
// cheap no-op — the sweep is safe to over-use, only wasteful.
//
// WHY IT IS A WORKFLOW AND NOT A TASK. Every other thing this pack does is a scheduled
// task, because it answers a recurring question. This answers no question and has no
// cadence: it is an OWNER-INITIATED operation with its own inputs (a repo filter, a dry
// run), and the thing that starts it is a human pressing "Run workflow". It carries no
// `schedule:` trigger, so the doctrine it would otherwise break — a repo's vendored
// scheduler is its ONLY cron (packs/basics/scheduled-tasks.md) — is untouched.
//
// THE TOKEN. FLEET_GITHUB_TOKEN, the same account-spanning PAT the three sweeps use, plus
// ONE scope they do not need: **Actions: read and write** on the owner's repositories.
// Dispatching another repo's workflow is a write to that repo's Actions, and a PAT scoped
// only for the sweeps gets a 403 here. That 403 is reported per repo and fails the run
// rather than being retried, because it is a grant to fix once, not a transient.
//
// Dependency-free (global fetch, Node 20+). It writes NOTHING to any member — no commit,
// no issue, no comment; the single side effect per member is one queued Actions run.
//
// It lives in its own folder under the pack root, beside the tasks rather than inside one,
// because it belongs to no task — its runner is the vendored workflow. What it shares with
// the sweeps stays where it was: the REST primitives (fleet-api.mjs) and the config reader
// (fleet-config.mjs), both one level up.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, paged, readDeclaration, isDormant, DECLARATION } from '../fleet-api.mjs';
import { parseSheepdogConfig } from '../fleet-config.mjs';
import {
  latestRunId, followFleet, renderFollowReport, deliveryOf, stampedRef,
  parseFollowMinutes, asBool, DEFAULT_FOLLOW_MINUTES,
} from './follow-fleet-baseline.mjs';

// The member-side workflow being fired, and the exact manual-run override it is fired
// with. Both are the vendored scheduler's public surface (engine/scheduler/stubs/
// claudinite-scheduler.yml + `forcedTaskIds` in engine/scheduler/run.mjs); named here as
// constants so the coupling is one line to find, not a string buried in a request body.
export const SCHEDULER = 'claudinite-scheduler.yml';
export const FORCE_OVERRIDES = 'FORCE_TASKS=baselining';

// --- classification (pure) ----------------------------------------------------

// What the dispatch POST's status means. Every branch is a DIFFERENT thing for the
// reader to do, which is why the sweep reports a state per repo instead of a count of
// failures: a 404 is a repo to adopt, a 403 is a token to re-scope, a 422 is a workflow
// GitHub has switched off. Kept free of I/O so the whole table is testable directly.
export function classifyDispatch(status) {
  switch (status) {
    case 204:
      return { state: 'forced', detail: 'baselining queued on its own scheduler' };
    case 404:
      // The workflow is missing, the repo has Actions disabled, or the PAT cannot see the
      // repo at all — indistinguishable from here, and all three mean "nothing was queued".
      return { state: 'no-scheduler', detail: `no ${SCHEDULER} on the default branch, or Actions is disabled — nothing there can baseline itself` };
    case 403:
      return { state: 'no-permission', detail: 'the PAT lacks Actions: write on this repo — dispatching a workflow is an Actions write, a scope the read-only sweeps never needed' };
    case 422:
      // GitHub disables a repo's scheduled workflows after 60 days of inactivity, and a
      // disabled workflow refuses dispatch; a scheduler stub too old to carry the
      // `overrides` input lands here too.
      return { state: 'not-dispatchable', detail: 'the workflow exists but refused the dispatch — it is disabled (GitHub switches off cron on inactive repos), or too old to accept the `overrides` input' };
    default:
      return { state: 'error', detail: `dispatch returned ${status}` };
  }
}

// The `repos` input, resolved against the owner: a comma/whitespace-separated list of
// bare names or full `owner/name`, lowercased, or null for "every member". A bare name is
// qualified with the configured owner, because that is the only owner this sweep can
// reach and typing it twenty times is friction with no upside.
export function parseRepoFilter(raw, owner) {
  const names = String(raw ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (!names.length) return null;
  return new Set(names.map((n) => (n.includes('/') ? n : `${owner}/${n}`).toLowerCase()));
}

// --- the dispatch -------------------------------------------------------------

// Fire one member's scheduler. `ref` is the member's DEFAULT branch (read from the
// enumeration, never assumed to be `main`): workflow_dispatch resolves the workflow file
// on the ref it is given, and a repo whose trunk is `master` would otherwise 404 as if it
// carried no scheduler at all.
export async function forceOne(gh, fullName, ref) {
  const { status } = await gh(`/repos/${fullName}/actions/workflows/${SCHEDULER}/dispatches`, {
    method: 'POST',
    body: { ref, inputs: { overrides: FORCE_OVERRIDES } },
  });
  return classifyDispatch(status);
}

// --- main ---------------------------------------------------------------------

export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read, and Actions READ AND WRITE) — '
      + 'the default GITHUB_TOKEN sees only this repo and cannot dispatch another repo\'s workflow.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const dryRun = String(process.env.FLEET_BASELINE_DRY_RUN ?? '').toLowerCase() === 'true';
  const includeDormant = String(process.env.FLEET_BASELINE_INCLUDE_DORMANT ?? '').toLowerCase() === 'true';
  // Following is the DEFAULT, and unset means on: the report is the reason the lever is
  // pulled by hand, and a run that has to be asked for its outcome is the shape this
  // replaced. Opting out stays available for the case it was built for — dispatching the
  // fleet and going away.
  const follow = asBool(process.env.FLEET_BASELINE_FOLLOW, true) && !dryRun;
  const followMinutes = parseFollowMinutes(process.env.FLEET_BASELINE_FOLLOW_MINUTES, DEFAULT_FOLLOW_MINUTES);

  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, exclude, canonRepo } = parseSheepdogConfig(cfg, home);
  const filter = parseRepoFilter(process.env.FLEET_BASELINE_REPOS, owner);

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope`);
  }

  const forced = []; const skipped = []; const failed = []; const watches = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    // Canon has no vendored mount, so its own baselining self-skips — forcing it would
    // queue a run whose only outcome is that skip. The enforcer repo itself is NOT
    // exempt: it is an ordinary member with a mount to converge, and leaving it out of a
    // fleet-wide force would make the one repo the owner is looking at the one repo that
    // did not move.
    if (fullName === canonRepo.toLowerCase()) continue;
    if (r.archived || r.fork || exclude.has(fullName)) continue;
    if (filter && !filter.has(fullName)) continue;

    let decl;
    try {
      decl = await readDeclaration(gh, r.full_name);
    } catch (e) {
      // Unreadable is not uncovered: a repo whose declaration could not be read might be
      // a member that needed this run, so it is a FAILURE to escalate, never a silent skip.
      failed.push({ fullName, state: 'error', detail: `could not read ${DECLARATION}: ${e.message}` });
      continue;
    }
    if (decl === null) continue;                                        // uncovered — the census's business
    if (isDormant(decl) && !includeDormant) {
      // A dormant member stopped its own scheduler; a forced dispatch on it either does
      // nothing (the run stops before evaluating anything) or wakes a repo that asked to
      // sleep. Reported, not silently dropped, so a fleet-wide force is never mistaken
      // for fleet-wide coverage.
      skipped.push({ fullName, state: 'dormant', detail: 'self-declared dormant — pass include_dormant to force it anyway' });
      continue;
    }

    if (dryRun) {
      forced.push({ fullName, state: 'would-force', detail: `would dispatch ${SCHEDULER}@${r.default_branch} with ${FORCE_OVERRIDES}` });
      continue;
    }
    // The two things that can only be read BEFORE the button is pressed: the ref this
    // member is stamped at (the "old version" the report reports against) and the newest
    // run already on its scheduler (how the run we are about to start is told apart from
    // the one its own hourly cron may start seconds later).
    const beforeRef = stampedRef(decl);
    const afterRunId = follow ? await latestRunId(gh, r.full_name, SCHEDULER) : null;

    const verdict = await forceOne(gh, r.full_name, r.default_branch);
    if (verdict.state !== 'forced') { failed.push({ fullName, ...verdict }); continue; }
    forced.push({ fullName, ...verdict });
    if (follow) {
      watches.push({
        fullName: r.full_name, defaultBranch: r.default_branch, delivery: deliveryOf(decl),
        beforeRef, afterRef: beforeRef, afterRunId, dispatchedAtMs: Date.now(),
        run: null, pull: null, agent: null, verdict: null, errors: [], warnings: [],
      });
    }
  }

  const runsUrl = (n) => `https://github.com/${n}/actions/workflows/${SCHEDULER}`;
  const summary = [
    `# Fleet baseline — ${owner}${dryRun ? ' (DRY RUN — nothing was dispatched)' : ''}`,
    '',
    `Fired \`${FORCE_OVERRIDES}\` at each covered member's own \`${SCHEDULER}\`.`,
    filter ? `Filtered to: ${[...filter].join(', ')}` : '',
    '',
    `| ${dryRun ? 'would force' : 'forced'} | skipped | failed |`,
    '| --- | --- | --- |',
    `| ${forced.length} | ${skipped.length} | ${failed.length} |`,
    '',
    forced.length
      ? `**${dryRun ? 'Would force' : 'Forced'}:**\n${forced.map((f) => `- [\`${f.fullName}\`](${runsUrl(f.fullName)})`).join('\n')}`
      : '**No member was dispatched** — check the filter, or whether anything under this owner is covered.',
    skipped.length ? `**Skipped:**\n${skipped.map((s) => `- \`${s.fullName}\` — **${s.state}**: ${s.detail}`).join('\n')}` : '',
    failed.length ? `**Failed:**\n${failed.map((f) => `- \`${f.fullName}\` — **${f.state}**: ${f.detail}`).join('\n')}` : '',
    '',
    // The dispatch API returns 204 with no body, so there is no run id to link here: each
    // member's own workflow page is the honest destination for the dispatch half. What
    // the queued run then DID is the follow half's report, appended below.
    follow
      ? '_A dispatch only queues a run. What each queued run went on to do is below — this sweep_\n'
        + '_follows every member it forced until that member has finished baselining._'
      : '_A dispatch queues a run; it does not report its outcome, and `follow` was off for this run._\n'
        + '_Each member reports its own baselining the way it always does — a maintenance PR, or a failure issue in that repo._',
  ].filter(Boolean).join('\n');

  const emit = (text) => {
    console.log(text);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  };
  emit(summary);

  // THE FOLLOW. Emitted as its own document after the dispatch table, because the two
  // answer different questions ("did the button get pressed" vs "what did the fleet do")
  // and a reader looking for the second should not have to read past the first. A DRY RUN
  // renders it too, with true zeros — see renderFollowReport: the shape of the report is
  // itself something to be able to inspect without changing anything.
  let unfinished = [];
  if (dryRun) {
    emit(renderFollowReport([], 0, followMinutes, { dryRun: true }));
  } else if (follow && watches.length) {
    console.log(`fleet-baseline: following ${watches.length} member(s) to completion (deadline ${followMinutes}m)`);
    const { elapsedMs } = await followFleet(gh, watches, { workflow: SCHEDULER, minutes: followMinutes });
    emit(renderFollowReport(watches, elapsedMs, followMinutes));
    unfinished = watches.filter((w) => w.verdict?.ok === false);
  }

  // What fails the run, and why each one does. A dispatch that never landed is a grant or
  // an adoption to fix; a member that baselined RED, or never finished inside the window,
  // is the outcome the owner pulled this lever to find out about, and reporting it in a
  // green run is how it goes unnoticed. Everything that DID converge is already reported
  // above — the throw ends the run, it does not withdraw the report.
  const reasons = [
    ...failed.map((f) => `${f.fullName}: ${f.state}`),
    ...unfinished.map((w) => `${w.fullName}: ${w.verdict.state}`),
  ];
  if (reasons.length) {
    throw new Error(`${reasons.length} member(s) did not come through cleanly (${reasons.join('; ')}) — `
      + 'the rest are reported above, and this run fails so the cause is escalated');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-baseline failed: ${e.message}`); process.exit(1); });
}
