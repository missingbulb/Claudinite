// The fleet-digest CODE-WORK entry point — `node worker.mjs`, run as a subprocess by
// the scheduler (cwd = this task dir, bounded by code_work_timeout).
//
// It holds no ranking logic (that is its sibling, collect-fleet-day.mjs) and no
// prose judgment (that is task.md, in the agent stage). What it does is the plumbing
// between them, and one decision:
//
//   THE DAY HAD CANDIDATES  → push the shortlist to the data branch and REQUEST the
//                             agent, which reads them and writes the brief.
//   THE DAY HAD NONE        → write the quiet-day brief here and request NO agent.
//
// The second half is the point of the conditional handoff (task-code-work DESIGN §3,
// E4): a fleet that merged nothing yesterday needs a brief that SAYS so — silence
// would be indistinguishable from a broken task — but it does not need a model to
// write four words, and dispatching one nightly to find nothing is the cost this
// shape exists to avoid.
//
// The shortlist reaches the agent THROUGH THE REPOSITORY (DESIGN §3's rule, not a
// convention worth bending): a force-pushed data branch, named to the agent in the
// work item's `Delivered` section. It is not landed on the default branch —
// scaffolding for one night's judgment is not part of the record the fleet keeps, and
// a daily commit of it would be pure churn. The RECORD is `digests/<date>.md`, which
// the agent lands.
//
// Two tokens, two jobs: the collector READS the fleet over FLEET_GITHUB_TOKEN (the
// Action token sees only this repo), and every write here — the data branch, the
// quiet-day brief's PR — goes over the ordinary Action GITHUB_TOKEN.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { makeGh, fleetWorkerFailed } from './fleet-reads.mjs';
import { missingFleetTokenError } from './fleet-token.mjs';
import { deliverGenerated, baseTip, pushGenerated, readAt, remoteUrl } from '../../../../engine/scheduler/deliver-generated.mjs';
import { parseParamBag, contextText } from './param-bag.mjs';
import { parseDigestConfig } from './digest-config.mjs';
import { collectDay, previousDay } from './collect-fleet-day.mjs';

// The fixed branch the shortlist lives on. FIXED, not dated: it is one night's
// scaffolding, force-pushed each run, so a dated branch per day would leave the repo
// accumulating a branch a night for a file nobody reads twice.
export const SHORTLIST_BRANCH = 'claudinite/fleet-digest-shortlist';
export const SHORTLIST_PATH = 'shortlist.json';
export const DIGESTS_DIR = 'digests';

// `-brief`, not a bare `claudinite/fleet-digest`: deliverGenerated reuses an open PR
// whose head branch merely STARTS WITH this prefix, so a bare one would also match
// every future `claudinite/fleet-digest-<anything>/…` branch and silently rewrite that
// PR instead of opening its own. Naming the artifact, not the task, keeps the match
// exact.
const PR_BRANCH_PREFIX = 'claudinite/fleet-digest-brief';
const item = process.env.CLAUDINITE_ITEM || '';
const log = (s) => console.log(`fleet-digest${item ? ` [#${item}]` : ''}: ${s}`);

export const digestPath = (date) => `${DIGESTS_DIR}/${date}.md`;

// The most days one backfill will take on. Not a guard against a typo so much as
// against the shape of the request: "catch me up" is a bounded ask, and a run that
// walked a year of the fleet would spend an hour doing it and produce a series nobody
// reads. Longer histories are several runs, deliberately.
const MAX_BACKFILL = 30;

// A one-time (or after-an-outage) catch-up, requested through the mechanism the queue
// already has: the item's Context, which code-work reads as `CLAUDINITE_CONTEXT`.
//
// So a backfill needs no new workflow, no new input, and no new secret — it is an
// ordinary hand-created item carrying one parameter:
//
//   create-work-item claudinite-dashboard/fleet-digest --context "DIGEST_BACKFILL_DAYS=7"
//
// Returns null when absent or unusable — never a partial guess, since the difference
// between "backfill 7 days" and "backfill 0 days" is a whole run's work.
export function parseBackfillDays(rawContext) {
  const bag = parseParamBag(rawContext);
  if (!('DIGEST_BACKFILL_DAYS' in bag)) return null;
  const n = Number(bag.DIGEST_BACKFILL_DAYS);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.floor(n), MAX_BACKFILL);
}

// The N most recent COMPLETE UTC days, oldest first. Oldest first so the series is
// written in the order it happened, and so a run that dies halfway leaves a contiguous
// history with a gap at the recent end — which the next run fills — rather than holes
// scattered through it.
export function backfillDates(now, days) {
  const out = [];
  for (let i = days; i >= 1; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// The instant a brief for `date` is written: the following midnight UTC. Passed to the
// collector as its `now`, which is what the nudge measures its quiet window back from.
//
// Using this rather than the wall clock makes a brief a PURE FUNCTION OF ITS DATE. A
// backfilled Tuesday is then the brief Tuesday would have got, not Tuesday's
// accomplishments with today's neglect stapled on — and a re-run of any day reproduces
// it exactly, which is the same property the nudge's date-seeded pick is after.
export const asOf = (date) => new Date(Date.parse(`${date}T00:00:00.000Z`) + 86400000);

// A brief is PLAIN TEXT, never markdown — it is sent verbatim through a notification
// renderer that parses no markdown and keeps no line breaks, so syntax arrives as
// literal characters in one running paragraph. The vocabulary that survives is a "• "
// per item and a bare URL, which the renderer autolinks. digest-plain-text.mjs holds
// the reasoning and enforces it over the landed series; task.md specifies the same
// shape for the agent-written briefs.
//
// Titles come from the GitHub API and carry the author's markdown — this fleet quotes
// identifiers in backticks constantly — so a title reproduced as a fact is flattened
// first. Backticks become double quotes because a quoted identifier is usually quoting
// something; asterisks are dropped, since the words carry the emphasis.
export const plain = (s) => s.replace(/`/g, '"').replace(/\*/g, '');

// The brief for a day the fleet merged nothing worth reporting. Written HERE rather
// than by an agent — there is no judgment in it — but written all the same, because
// the dated series is the thing that makes a missing brief legible as a fault.
export function renderQuietDay({ date, members, maintenance, nudge }) {
  const lines = [
    `Fleet operations — ${date}`,
    '',
    `No pull requests merged and no issues closed across ${members.length} active member(s)`
      + `${maintenance ? `, beyond ${maintenance} Claudinite maintenance PR(s)` : ''}.`,
    '',
  ];
  if (nudge) lines.push(...renderNudge(nudge), '');
  lines.push('Written by the fleet-digest task. No agent ran: there was nothing to judge.');
  return `${lines.join('\n')}\n`;
}

// The nudge section, shared between the quiet-day brief written here and the
// agent-written one (task.md reproduces this shape). It is deterministic — the repo,
// the date, and the last thing that happened are all facts — so the agent is asked
// only to add the one-line suggestion, never to restate these.
export function renderNudge(nudge) {
  const lines = ['Worth returning to:', ''];
  if (nudge.last) {
    const when = nudge.last.at.slice(0, 10);
    lines.push(`• ${nudge.repo} — last meaningful change ${when}: #${nudge.last.number} ${plain(nudge.last.title)} ${nudge.last.url}`);
  } else {
    lines.push(`• ${nudge.repo} — no meaningful change found in the lookback window.`);
  }
  return lines;
}

// The run report — every member accounted for, and every bound this run applied
// named. `capped` in particular: a run that ranked only the newest 80 of 200 merges
// must say so, or the brief reads as a complete account of a day it only sampled.
export function renderSummary(day, { agent }) {
  // `null` is "this line does not apply"; `''` is a deliberate blank the markdown
  // needs (a table followed immediately by prose is absorbed INTO the table), so the
  // filter tests for null rather than falsiness.
  return [
    `# Fleet digest — ${day.date}`,
    '',
    '| members | candidates | shortlisted | machine-filed | not sized (capped) |',
    '| --- | --- | --- | --- | --- |',
    `| ${day.members.length} | ${day.considered} | ${day.shortlist.length} | ${day.maintenance} | ${day.capped} |`,
    '',
    day.shortlist.length
      ? `**Shortlist (by size, agent picks from these):**\n${day.shortlist.map((i) => `- \`${i.repo}\` ${i.kind === 'pr' ? 'PR' : 'issue'} #${i.number} — ${i.title} (weight ${i.weight})`).join('\n')}`
      : '**Shortlist:** none — nothing merged or closed yesterday',
    day.nudge ? `**Nudge:** ${day.nudge.repo}${day.nudge.alsoQuiet.length ? ` (also quiet: ${day.nudge.alsoQuiet.join(', ')})` : ''}` : '**Nudge:** none (disabled, or every member is active)',
    day.skipped.length ? `**Not drawn on:** ${day.skipped.join(', ')}` : null,
    day.capped ? `**Capped:** ${day.capped} merged PR(s) beyond this run's sizing bound were not ranked.` : null,
    '',
    agent ? '_Agent requested: the shortlist needs judgment._' : '_Agentless night: the brief was written here._',
  ].filter((l) => l !== null).join('\n');
}

// Collect each requested day and sort it into one of three piles: already written,
// quiet (no judgment needed — code-work writes it), or needing the agent.
//
// Extracted from main so the loop is testable without a git remote. The three-way
// split IS the backfill: a run that mislabelled a quiet day as needing judgment would
// dispatch an agent to write "nothing happened", and one that mislabelled an
// already-written day would rewrite a brief the fleet has already read.
export async function planBriefs({ gh, dates, exists, owner, exclude, digest, log = () => {} }) {
  const quietFiles = {};
  const needJudgment = [];
  const summaries = [];
  const skipped = [];

  for (const date of dates) {
    // Already written — a re-run, a forced run, a backfill overlapping days the
    // scheduler has since covered. The brief is the record of a day, and a day has
    // one. Skipping rather than rewriting is what makes a backfill safe to re-run and
    // safe to overlap with the daily task.
    if (exists(date)) { skipped.push(date); continue; }

    // `now` is the morning AFTER the day in question, never the wall clock — see asOf.
    const day = await collectDay(gh, {
      owner, exclude, date, now: asOf(date), shortlist: digest.shortlist, nudge: digest.nudge,
    });
    const wantsAgent = day.shortlist.length > 0;
    summaries.push(renderSummary(day, { agent: wantsAgent }));
    log(`${date}: ${day.considered} candidate(s), ${wantsAgent ? `${day.shortlist.length} shortlisted` : 'quiet'}`);

    if (wantsAgent) {
      needJudgment.push({
        date,
        members: day.members,
        considered: day.considered,
        maintenance: day.maintenance,
        capped: day.capped,
        shortlist: day.shortlist,
        nudge: day.nudge,
      });
    } else {
      quietFiles[digestPath(date)] = renderQuietDay(day);
    }
  }

  return { quietFiles, needJudgment, summaries, skipped };
}

export async function main() {
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }
  const root = process.env.CLAUDINITE_REPO_ROOT || process.cwd();
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const fleetToken = process.env.FLEET_GITHUB_TOKEN;
  const base = process.env.CLAUDINITE_DEFAULT_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN is not set — the digest cannot deliver anything');
  if (!fleetToken) {
    throw missingFleetTokenError(
      'The collector reads every repository under the owner, which only an account-spanning PAT can see.');
  }

  // The config is read from the CHECKOUT, not over the API: this is our own repo and
  // the scheduler already has it at the commit this run is reasoning about.
  const declaration = JSON.parse(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'));
  const digest = parseDigestConfig(declaration, repo);
  const { owner, exclude } = digest;

  const now = new Date();
  const backfill = parseBackfillDays(contextText());
  const dates = backfill ? backfillDates(now, backfill) : [previousDay(now)];
  const baseSha = baseTip(root, remoteUrl(repo, token), base);

  if (backfill) log(`BACKFILL: ${backfill} day(s), ${dates[0]} … ${dates[dates.length - 1]}`);
  // Which declaration each fleet key came from, said out loud: this task read them off
  // the `claudinite-fleet-sheepdog` entry until it moved here, and a run that quietly covered a
  // different set of repos than the last one would look identical to one that did not.
  log(`covering ${owner} (${digest.source.owner}), ${exclude.size} excluded (${digest.source.exclude})`);
  log(`pick ${digest.pick} of a ${digest.shortlist}-item shortlist`
    + `${digest.nudge.enabled ? `, nudge after ${digest.nudge.quietDays}d quiet` : ', nudge off'}`);

  const { quietFiles, needJudgment, summaries, skipped } = await planBriefs({
    gh: makeGh(fleetToken),
    dates,
    exists: (date) => readAt(root, baseSha, digestPath(date)) !== null,
    owner,
    exclude,
    digest,
    log,
  });
  if (skipped.length) log(`already written, skipped: ${skipped.join(', ')}`);

  const summary = summaries.join('\n\n---\n\n')
    || `# Fleet digest\n\nEvery requested day already has a brief — nothing to do.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  // Quiet days need no judgment, so they land here — all of them in ONE pull request,
  // however many days this run covered.
  if (Object.keys(quietFiles).length) {
    const days = Object.keys(quietFiles).length;
    const pr = await deliverGenerated({
      root, repo, base, token, stamp: dates[dates.length - 1], branchPrefix: PR_BRANCH_PREFIX, log,
      files: quietFiles,
      message: `Claudinite: fleet operations brief${days > 1 ? 's' : ''} (${days} quiet day${days > 1 ? 's' : ''})`,
      title: `Claudinite: fleet operations brief${days > 1 ? 's' : ''} — ${days} quiet day${days > 1 ? 's' : ''}`,
      body: `Nothing merged or closed on ${days} day(s). Written by code_work; no agent ran.\n\n${Object.keys(quietFiles).map((p) => `- \`${p}\``).join('\n')}`,
    });
    log(`${days} quiet day(s) — ${pr.reused ? 'updated' : 'opened'} PR ${pr.number !== null ? `#${pr.number}` : `on ${pr.branch}`}${pr.merged ? ' (landed)' : ''}`);
  }

  if (!needJudgment.length) {
    log('no day needs the agent');
    return;
  }

  // Hand the shortlists over the ONE sanctioned channel: the repository. The branch
  // carries the base tree plus this one file, force-pushed, so the agent reads it at a
  // ref that is always this run's.
  //
  // `days` is an ARRAY even for an ordinary single-day run. One shape for both means
  // task.md describes one thing — "write a brief per entry" — and a backfill needs no
  // second code path in the instructions, which is where a second path would be most
  // expensive.
  pushGenerated(root, {
    remote: remoteUrl(repo, token),
    baseSha,
    branch: SHORTLIST_BRANCH,
    files: {
      [SHORTLIST_PATH]: `${JSON.stringify({
        pick: digest.pick,
        generatedAt: now.toISOString(),
        days: needJudgment,
      }, null, 2)}\n`,
    },
    message: `Claudinite: fleet-digest shortlist (${needJudgment.map((d) => d.date).join(', ')})`,
  });

  const total = needJudgment.reduce((n, d) => n + d.shortlist.length, 0);
  const requestFile = process.env.CLAUDINITE_REQUEST_AGENT;
  if (requestFile) {
    writeFileSync(requestFile, `${JSON.stringify({
      delivered: { branch: SHORTLIST_BRANCH },
      reason: {
        code: 'shortlist-ready',
        detail: needJudgment.length === 1
          ? `${total} candidate(s) of ${needJudgment[0].considered} need reading to pick ${digest.pick}`
          : `backfill: ${needJudgment.length} days, ${total} candidate(s) to read`,
      },
    })}\n`);
  }
  log(`requested agent stage — ${needJudgment.length} day(s), ${total} shortlisted on ${SHORTLIST_BRANCH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => fleetWorkerFailed('fleet-digest', e));
}
