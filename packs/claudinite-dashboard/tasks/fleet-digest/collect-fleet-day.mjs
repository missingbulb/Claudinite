// The fleet-digest COLLECTOR — one UTC day of the fleet's work, gathered and ranked
// deterministically so the agent stage only ever does the part that needs judgment.
//
// The split this module exists to enforce: SIZE IS ARITHMETIC, IMPORTANCE IS
// JUDGMENT. Which pull requests and issues the fleet closed yesterday, and how big
// each one was, are facts — no agent should burn a dispatch rediscovering them, and
// an agent that did would rediscover them slightly differently every night. Which
// four of them were the day's real accomplishments is a reading of the text, which is
// exactly what the agent is for. So this file ranks by size and hands over a
// SHORTLIST; picking from that shortlist happens in task.md and nowhere else.
//
// Everything here is injectable-`gh` pure: no env, no tokens, no clock of its own
// (the day and the "now" are arguments). That is what makes the ranking and the
// maintenance filter testable against fixtures rather than against the live fleet.

import { paged, readDeclaration, isDormant } from './fleet-reads.mjs';
import { isDispatchTitle } from '../../../claudinite-tasks/shared-code/work-items.mjs';
import { isWorkItemTitle } from '../../../claudinite-tasks/shared-code/work-items.mjs';

// How many pages of a repo's closed pull requests the walk will read before giving
// up. 100 per page, so three pages is 300 closed PRs — comfortably more than any
// member of this fleet closes in the lookback, and a hard stop against a repo whose
// history would otherwise be paged through in full every single night.
const MAX_PR_PAGES = 3;

// How many pull requests the collector will fetch FULL detail for in one run. The
// list endpoint does not carry additions/deletions, so exact size costs one request
// per PR — bounded here, and whatever the bound drops is REPORTED (see `capped`)
// rather than silently vanishing from the ranking.
const MAX_DETAIL = 80;

// How much of an item's own text travels to the agent. The agent is told to read the
// text and nothing else, so the text has to come with the shortlist — but a 40kB
// design-doc PR body would crowd out the other five candidates.
const EXCERPT = 1500;

// Rough commensurability between a pull request and an issue, so one ranked list can
// hold both. A PR's weight is the lines it touched; an issue's is its prose converted
// to line-equivalents at 40 characters a line, plus ten lines a comment for the
// discussion the list payload only gives us a count of. It is a heuristic and says so
// — its whole job is to put a 900-line refactor above a two-line typo fix and a long
// argued-out issue above a drive-by, which it does.
const CHARS_PER_LINE = 40;
const LINES_PER_COMMENT = 10;

const iso = (d) => d.toISOString();
const dayStart = (date) => new Date(`${date}T00:00:00.000Z`);
const dayEnd = (date) => new Date(`${date}T23:59:59.999Z`);

// The UTC day BEFORE the given instant — the day a morning brief is about.
export function previousDay(now) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Is this pull request the fleet maintaining ITSELF rather than someone accomplishing
// something? Claudinite's own machinery merges into every member nightly — the mount
// converge, the usage fold, the fleet aggregates — and those are the single largest
// source of merged PRs in this fleet by count. A brief that ranked them alongside real
// work would report the scheduler back to the owner as their own accomplishment every
// morning.
//
// Three independent tests, because each catches what the others miss: the head branch
// (every engine-delivered PR is cut under `claudinite/`), the title prefix (what the
// engine names its own commits), and the author being a bot at all. A human PR that
// happens to touch the mount is NOT maintenance by this test, which is the right way
// round — the owner deciding to change how the fleet maintains itself is real work.
export function isMaintenance(pr) {
  const ref = pr?.head?.ref ?? '';
  const title = pr?.title ?? '';
  const login = pr?.user?.login ?? '';
  return ref.startsWith('claudinite/')
    || /^claudinite\b/i.test(title)
    || pr?.user?.type === 'Bot'
    || login.endsWith('[bot]');
}

// The same question for an ISSUE, and it needs its own answer because the fleet files
// far more issues at itself than a human ever does: every occurrence of every
// scheduled task is a `[claudinite-work]` item in the member it runs against, and
// the escalation path opens `Claudinite scheduler run failed` on top of that.
//
// Left unfiltered these do not merely appear in the brief — they WIN it. An issue's
// weight counts its discussion, and a work item accumulates a comment per stage from
// the executor and the session working it, so machinery that closed itself outranks a
// person's day. The first real backfill put three of one day's six shortlist slots
// into machine issues, which is the exact failure isMaintenance was written to
// prevent for pull requests, arriving through the door nobody guarded.
//
// BOTH TITLE VOCABULARIES, and each test is the engine's own rather than a private
// regex — the same exclusion the signal collectors apply so a repo never treats its
// own machinery as work. `[claudinite-work]` is what the queue files and is the one
// that matters going forward; `[claudinite-task]` is the retired slot mechanism's,
// kept because a member's closed issues from before the retirement are still inside
// the digest's lookback and would flood a backfill.
export function isMachineIssue(issue) {
  const title = issue?.title ?? '';
  const login = issue?.user?.login ?? '';
  return isWorkItemTitle(title)
    || isDispatchTitle(title)
    // The schedule board (#1115). A literal rather than an import of
    // packs/claudinite-tasks/queue/schedule-board.mjs's SCHEDULE_PREFIX: the engine
    // lane and the pack lane deliver on separate cycles, and a pack importing
    // a module the member's older mount does not yet hold fails the whole
    // mount's self-test (#1004).
    || title.startsWith('[claudinite-schedule]')
    || /^claudinite\b/i.test(title)
    || issue?.user?.type === 'Bot'
    || login.endsWith('[bot]');
}

export const prWeight = (pr) => (pr.additions ?? 0) + (pr.deletions ?? 0);

export const issueWeight = (issue) => Math.round(
  ((issue.title ?? '').length + (issue.body ?? '').length) / CHARS_PER_LINE,
) + ((issue.comments ?? 0) * LINES_PER_COMMENT);

const excerpt = (text) => {
  const s = (text ?? '').trim();
  return s.length <= EXCERPT ? s : `${s.slice(0, EXCERPT)}\n…[truncated]`;
};

// Every repo under the owner that this brief may draw on: covered (it carries the
// declaration), not dormant, not excluded, not a fork or archive. The same membership
// test the census applies, for the same reason — a brief about repos the fleet does
// not consider members would report on work nothing else in the fleet tracks.
//
// Dormancy is honoured here rather than filtered later because it governs BOTH halves:
// a dormant repo contributes no accomplishments AND is never nudged about. It stopped
// its own scheduler on purpose, and prodding someone about a project they deliberately
// parked is the exact opposite of a useful nudge.
export async function enumerateMembers(gh, { owner, exclude }) {
  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => (r.owner?.login ?? '').toLowerCase() === owner);
  if (!mine.length) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope`);
  }

  const members = [];
  const skipped = [];
  for (const r of mine) {
    const full = r.full_name;
    if (exclude.has(full.toLowerCase())) { skipped.push(`${full} (excluded)`); continue; }
    if (r.archived || r.fork) { skipped.push(`${full} (${r.archived ? 'archived' : 'fork'})`); continue; }
    const declaration = await readDeclaration(gh, full);
    if (declaration === null) { skipped.push(`${full} (uncovered)`); continue; }
    if (isDormant(declaration)) { skipped.push(`${full} (dormant)`); continue; }
    members.push(full);
  }
  return { members, skipped };
}

// One member's closed pull requests, newest-updated first, walked only as far back as
// `since`. Bounded by MAX_PR_PAGES — see the constant.
async function walkClosedPrs(gh, repo, since) {
  const out = [];
  for (let page = 1; page <= MAX_PR_PAGES; page += 1) {
    const { status, json } = await gh(
      `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
    );
    if (status !== 200 || !Array.isArray(json)) {
      throw new Error(`listing closed PRs for ${repo} returned ${status}`);
    }
    out.push(...json);
    if (json.length < 100) break;
    // `sort=updated desc` means once a page ends older than the lookback, everything
    // after it is older too.
    if (new Date(json[json.length - 1].updated_at) < since) break;
  }
  return out;
}

// One member's issues closed inside the window. `since` filters on UPDATED, so the
// closed_at test still has to be applied — an old issue commented on yesterday comes
// back from this endpoint and is not a closure.
async function closedIssues(gh, repo, from, to) {
  const { status, json } = await gh(
    `/repos/${repo}/issues?state=closed&sort=updated&direction=desc&since=${iso(from)}&per_page=100`,
  );
  if (status !== 200 || !Array.isArray(json)) {
    throw new Error(`listing closed issues for ${repo} returned ${status}`);
  }
  return json.filter((i) => !i.pull_request && i.closed_at
    && new Date(i.closed_at) >= from && new Date(i.closed_at) <= to);
}

// Collect and rank one UTC day. Returns everything the worker needs to write the
// shortlist and everything the summary needs to account for the run:
//
//   { date, members, skipped, candidates, shortlist, maintenance, capped, nudge }
//
// `candidates` is every non-maintenance item found, ranked; `shortlist` is the head of
// it the agent actually receives. Both are kept because the run summary reports how
// many were considered, and "6 of 31" and "6 of 6" are very different days.
export async function collectDay(gh, {
  owner, exclude, date, now, shortlist: shortlistSize, nudge,
}) {
  const from = dayStart(date);
  const to = dayEnd(date);
  // One walk per repo serves both halves: the window for accomplishments, and the
  // longer quiet-period lookback for the nudge. Whichever reaches further back wins.
  const quietFrom = nudge.enabled
    ? new Date(new Date(now).getTime() - (nudge.quietDays * 86400000))
    : from;
  const lookback = quietFrom < from ? quietFrom : from;

  const { members, skipped } = await enumerateMembers(gh, { owner, exclude });

  const merged = [];
  const closed = [];
  const lastMeaningful = new Map();
  let maintenance = 0;

  for (const repo of members) {
    const prs = await walkClosedPrs(gh, repo, lookback);
    for (const pr of prs) {
      if (!pr.merged_at) continue;
      const mergedAt = new Date(pr.merged_at);
      const chore = isMaintenance(pr);
      if (mergedAt >= from && mergedAt <= to) {
        if (chore) maintenance += 1;
        else merged.push({ repo, pr });
      }
      // The nudge's clock: when did this repo last do something that WASN'T the fleet
      // maintaining it? Tracked over the whole walk, not just the window.
      if (!chore && (!lastMeaningful.has(repo) || mergedAt > lastMeaningful.get(repo).at)) {
        lastMeaningful.set(repo, { at: mergedAt, title: pr.title, number: pr.number, url: pr.html_url });
      }
    }
    for (const issue of await closedIssues(gh, repo, from, to)) {
      // Counted, not silently dropped — `maintenance` is the brief's account of how
      // much of the day was the fleet servicing itself, and an issue the machinery
      // filed and closed belongs in that number just as a converge PR does.
      if (isMachineIssue(issue)) { maintenance += 1; continue; }
      closed.push({ repo, issue });
    }
  }

  // Exact PR size costs a request each, so spend them newest-first and report the
  // bound rather than quietly ranking a truncated field (a cap nobody is told about
  // reads as "this was everything").
  merged.sort((a, b) => new Date(b.pr.merged_at) - new Date(a.pr.merged_at));
  const capped = Math.max(0, merged.length - MAX_DETAIL);
  const detailed = [];
  for (const { repo, pr } of merged.slice(0, MAX_DETAIL)) {
    const { status, json } = await gh(`/repos/${repo}/pulls/${pr.number}`);
    if (status !== 200 || !json) throw new Error(`reading ${repo}#${pr.number} returned ${status}`);
    detailed.push({
      kind: 'pr',
      repo,
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      at: pr.merged_at,
      weight: prWeight(json),
      additions: json.additions ?? 0,
      deletions: json.deletions ?? 0,
      files: json.changed_files ?? 0,
      comments: (json.comments ?? 0) + (json.review_comments ?? 0),
      body: excerpt(json.body),
    });
  }

  const issueItems = closed.map(({ repo, issue }) => ({
    kind: 'issue',
    repo,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    at: issue.closed_at,
    weight: issueWeight(issue),
    comments: issue.comments ?? 0,
    body: excerpt(issue.body),
  }));

  const candidates = [...detailed, ...issueItems]
    .sort((a, b) => b.weight - a.weight || a.repo.localeCompare(b.repo) || a.number - b.number);

  return {
    date,
    members,
    skipped,
    maintenance,
    capped,
    considered: candidates.length,
    shortlist: candidates.slice(0, shortlistSize),
    nudge: nudge.enabled ? pickNudge({ members, lastMeaningful, quietFrom, date }) : null,
  };
}

// Choose ONE quiet project to prod about. "Quiet" is measured on meaningful merges,
// never on pushes: every member's mount is converged nightly, so `pushed_at` is fresh
// on every repo in this fleet every single day and would report the whole fleet as
// active forever.
//
// The choice among the quiet ones is random, as the owner's routine asks — but seeded
// off the DATE rather than Math.random, so the same day always nominates the same
// project. A rerun (a retried run, a re-dispatched agent) then produces the same brief
// instead of quietly nominating something else, and a reader who wonders why they were
// prodded about this one can reproduce the answer.
export function pickNudge({ members, lastMeaningful, quietFrom, date }) {
  const quiet = members
    .filter((repo) => {
      const last = lastMeaningful.get(repo);
      return !last || last.at < quietFrom;
    })
    .sort();
  if (!quiet.length) return null;

  let seed = 0;
  for (const ch of date) seed = ((seed * 31) + ch.charCodeAt(0)) >>> 0;
  const repo = quiet[seed % quiet.length];
  const last = lastMeaningful.get(repo) ?? null;
  return {
    repo,
    quietSince: last ? last.at.toISOString() : null,
    last: last ? { title: last.title, number: last.number, url: last.url, at: last.at.toISOString() } : null,
    alsoQuiet: quiet.filter((r) => r !== repo),
  };
}
