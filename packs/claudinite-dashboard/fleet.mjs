// The fleet view's derivation — many members' raw reads in, one ranked overview out.
// Pure: no clock, no I/O, no DOM.
//
// A fleet page answers a different question from the per-repo one. Per repo the
// question is "what is this scheduler doing"; across a fleet it is "WHERE DO I NEED
// TO LOOK", and a page that answers the first question twelve times over does not
// answer the second. So nothing here is a total for its own sake: every number is
// either something that needs a human, something that is about to, or the context
// needed to tell those apart.
//
// Three ideas do the work:
//
//   ATTENTION IS EARNED, NOT COUNTED. A member surfaces because something is true of
//   it — an item parked, a leash blown, a scheduler failing, a mount that stopped
//   converging — and each of those arrives as a REASON with a severity, not as a
//   number to be summed. The ranking is over the worst reason, so a member with one
//   parked item outranks one with forty healthy work items.
//
//   ABSENCE IS A STATE. A member that does not run Claudinite, one the viewer cannot
//   read, and one that is running fine are three different answers and never collapse
//   into "0". A fleet view whose blanks are ambiguous is worse than no fleet view.
//
//   ONE MEMBER'S FAILURE IS ONE ROW'S PROBLEM. Every member is summarised
//   independently and a read that failed becomes a row saying so, so a single private
//   repo or a rate-limit stumble cannot blank the page.

import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';
import { periodMs } from '../claudinite-tasks/shared-code/anchors.mjs';
import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN, URGENT,
  NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_ACTION, outcomeOf, isParked,
} from '../claudinite-tasks/shared-code/work-items.mjs';
import { installedVersions } from '../../engine/installed-versions.mjs';
import { VERSION_SOURCE, versionFromLiteral, isVersion, versionAbove } from '../../engine/version.mjs';
import { describeItem, isWorkItem, parseWorkItemTitle, taskDeclarationPaths } from './model.mjs';
import { commitDays } from './activity.mjs';
import { itemCandidate, pickCandidate } from './next-work.mjs';

// Severity ladder, worst first. The order IS the sort, so it is stated once here
// rather than implied by comparisons scattered through the render.
export const LEVELS = ['critical', 'serious', 'warning', 'info', 'ok'];
const levelRank = (l) => {
  const i = LEVELS.indexOf(l);
  return i === -1 ? LEVELS.length : i;
};

const ms = (t) => (t == null ? null : new Date(t).getTime());

// --- the canon side of the comparison ---------------------------------------------

// The canon's versions are lifted as TEXT, like every declaration field: the page
// reads the canon over the API, where there is nothing to import. Comment-stripped
// so prose naming the field can never be mistaken for it, and null — never a guess —
// when the pattern is not there.
const ENGINE_VERSION_RE = new RegExp(String.raw`ENGINE_VERSION\s*=\s*'?(${VERSION_SOURCE})'?`);
const PACK_VERSION_RE = new RegExp(String.raw`(?:^|[{,\s])version:\s*'?(${VERSION_SOURCE})'?`, 'm');

export function parseEngineVersion(text) {
  const m = ENGINE_VERSION_RE.exec(stripComments(String(text ?? '')));
  return m ? versionFromLiteral(m[1]) : null;
}

export function parsePackVersion(text) {
  const m = PACK_VERSION_RE.exec(stripComments(String(text ?? '')));
  return m ? versionFromLiteral(m[1]) : null;
}

// --- mount freshness ------------------------------------------------------------

// Whether a member's mount is current, judged on the versions it has installed —
// the only thing left to judge it on, and the only thing that was ever right. The
// `ref` and `updated` that sat beside them held the provenance of the last FULL
// re-vendor, so a member converging nightly carried a months-old pair forever and
// anything judging either read every healthy member as behind or stalled (#1065,
// the same class as #786); #1252 deleted both.
//
// `canon` is the reference to compare against: its live `engineVersion` and the
// canon's own per-pack versions (`packVersions`, possibly partial — the loader
// fetches only the packs members actually stamp). A pack the canon side cannot
// price is counted `unknownPacks`, never silently judged current. With no canon
// supplied the honest answer is `unknown`, not `current`.
export function mountState(declaration, canon = null) {
  if (!declaration) return { state: 'none', engineVersion: null };
  // The shape reader canonicalizes as it goes: a version is stored data, and a pack
  // renamed since it was written still keys under the old spelling in the retired
  // block, which must compare rather than read as unknown.
  const { engineVersion, packVersions } = installedVersions(declaration);

  if (engineVersion == null && Object.keys(packVersions).length === 0) {
    // A stamp with no versions predates the versioned flows entirely — this member
    // has not converged since they landed, which is its own kind of stale.
    return { state: 'unversioned', engineVersion };
  }
  if (canon?.engineVersion == null) return { state: 'unknown', engineVersion };

  if (isVersion(engineVersion) && versionAbove(canon.engineVersion, engineVersion)) {
    return { state: 'behind-engine', engineVersion, canonEngineVersion: canon.engineVersion };
  }

  const behindPacks = [];
  let comparedPacks = 0;
  let unknownPacks = 0;
  for (const [pack, version] of Object.entries(packVersions ?? {})) {
    const canonVersion = canon.packVersions?.[pack];
    if (canonVersion == null) { unknownPacks += 1; continue; }
    comparedPacks += 1;
    if (versionAbove(canonVersion, version)) behindPacks.push({ pack, version, canonVersion });
  }
  if (behindPacks.length) {
    return { state: 'behind', engineVersion, behindPacks, comparedPacks, unknownPacks };
  }
  return { state: 'current', engineVersion, comparedPacks, unknownPacks };
}

// --- one member -----------------------------------------------------------------

// Everything a fleet row shows about one member, plus the reasons it needs looking
// at. `read` is what the loader managed to fetch; a member it could not read arrives
// with `error` set and every other field absent.
export function summariseMember(read, { now, canon = null } = {}) {
  const {
    repo, error = null, declaration = null, items = null, runs = null, paths = null,
    prs = null, head = null, stars = null, defaultBranch = null, commits = undefined,
  } = read ?? {};

  if (error) {
    // A read the page DECLINED to make is not the same fact as one it could not make:
    // the repo is fine, the budget is not, and the row must not read as a fault of the
    // member. It is raised a rung above a permissions miss because it is the one the
    // viewer can act on — sign in, or wait for the reset.
    const withheld = error?.status === 'budget';
    return {
      repo,
      status: withheld ? 'withheld' : 'unreadable',
      level: withheld ? 'warning' : 'info',
      error,
      // Not being able to read a member is not the member being broken. It is almost
      // always a private repo outside this viewer's grant, so it is reported at the
      // bottom of the page rather than raised as an alarm.
      reasons: [{ level: withheld ? 'warning' : 'info', text: describeReadError(error) }],
    };
  }

  if (!declaration) {
    return {
      repo,
      status: 'not-adopted',
      level: 'info',
      reasons: [{ level: 'info', text: 'does not run Claudinite' }],
    };
  }

  const work = (items ?? []).filter(isWorkItem);
  const open = work.filter((i) => i.state === 'open');
  const closed = work.filter((i) => i.state === 'closed');

  const declaredTasks = paths ? taskDeclarationPaths(paths, declaration).length : null;
  const periodFor = () => null;   // the fleet row needs no per-task cadence
  const described = open.map((i) => describeItem(i, now, { periodFor }));

  const byState = { [BLOCKED]: 0, [READY]: 0, [EXECUTING]: 0, [AGENT]: 0, [NEEDS_HUMAN]: 0, other: 0 };
  for (const d of described) {
    if (byState[d.state] === undefined) byState.other += 1;
    else byState[d.state] += 1;
  }

  const parked = described.filter((d) => d.state === NEEDS_HUMAN);
  // The triage split (tasks-dispatch DESIGN §4): a failure park — or one an older
  // engine left unclassified — holds its task's lane; an action or decision park is
  // a person's inbox; an approval park is a run that SUCCEEDED and waits on a merge.
  // Three different alarms, because a page that rings identically for all four
  // teaches the reader to ignore the ring.
  const holding = parked.filter((d) => d.blockingPark);
  const approvals = parked.filter((d) => !d.blockingPark && d.triage === NEEDS_HUMAN_APPROVAL);
  // The person's inbox, split by remedy because the two cost differently (`PARK_MINUTES`):
  // an action is a thing to change outside the code, a decision is a call to make. A park
  // that is neither, and is not blocking, cannot occur — `parkOf` sends every kind it
  // cannot decode to `failure` — so `decisions` is the residue rather than a third lane.
  const actions = parked.filter((d) => !d.blockingPark && d.triage === NEEDS_HUMAN_ACTION);
  const decisions = parked.filter((d) => !d.blockingPark && ![NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_ACTION].includes(d.triage));
  const inbox = [...actions, ...decisions];
  const warned = described.filter((d) => d.state !== NEEDS_HUMAN && d.warnings.length);

  const outcomes = { done: 0, delivered: 0, obsolete: 0, none: 0 };
  for (const i of closed) outcomes[outcomeOf(i) ?? 'none'] += 1;

  const lastActivity = closed
    .map((i) => ms(i.closed_at) ?? ms(i.updated_at))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] ?? null;

  const runSummary = summariseRuns(runs ?? [], now);
  const ci = ciStatus(runs ?? [], defaultBranch);
  const mount = mountState(declaration, canon);

  const n = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
  // Every reason carries a `kind`, because the row shows some of these twice
  // otherwise: parks have their own column with an estimate beside them, the mount
  // is a badge on the pack count, and CI is a dot. The RANKING still reads all of
  // them — a member is ordered by everything true of it — and only the rendering
  // drops what already has a cell of its own.
  const reasons = [];
  if (holding.length) {
    reasons.push({ kind: 'park', level: 'critical', text: `${n(holding.length, 'item')} parked broken — holding the task's lane` });
  }
  if (inbox.length) {
    reasons.push({ kind: 'park', level: 'serious', text: `${n(inbox.length, 'item')} parked for a person — an action or a decision` });
  }
  if (approvals.length) {
    reasons.push({ kind: 'park', level: 'warning', text: `${n(approvals.length, 'PR')} waiting for approval` });
  }
  if (runSummary.consecutiveFailures > 0) {
    reasons.push({
      kind: 'scheduler',
      level: runSummary.consecutiveFailures > 1 ? 'critical' : 'serious',
      text: `scheduler last run failed${runSummary.consecutiveFailures > 1 ? ` (${runSummary.consecutiveFailures} in a row)` : ''}`,
    });
  }
  if (warned.length) {
    reasons.push({ kind: 'park', level: 'serious', text: `${n(warned.length, 'item')} tripping a recovery rule` });
  }
  if (mount.state === 'behind-engine') {
    reasons.push({ kind: 'mount', level: 'serious', text: `mount is on engine v${mount.engineVersion}, canon is v${canon?.engineVersion}` });
  } else if (mount.state === 'behind') {
    reasons.push({ kind: 'mount', level: 'info', text: `mount behind canon on ${mount.behindPacks.map((p) => p.pack).join(', ')}` });
  } else if (mount.state === 'unversioned') {
    reasons.push({ kind: 'mount', level: 'warning', text: 'declares Claudinite but records no installed versions — the mount has never been converged' });
  } else if (mount.state === 'none') {
    reasons.push({ kind: 'mount', level: 'warning', text: 'declares Claudinite but carries no mount stamp' });
  }
  // A repo that declares tasks and has never produced a work item is not idle — its
  // scheduler is not running. That is invisible in every per-repo number here, which
  // is exactly why the fleet view is the place it shows up.
  if (declaredTasks !== null && declaredTasks > 0 && work.length === 0) {
    reasons.push({ kind: 'scheduler', level: 'serious', text: `${declaredTasks} task${declaredTasks > 1 ? 's' : ''} declared, no work item ever created` });
  }
  if (ci.state === 'failing') {
    // The member's own CI, said in the member's own words: this is not the scheduler
    // failing, and the two must not read as the same alarm.
    reasons.push({ kind: 'ci', level: 'warning', text: 'the repo\'s own CI is failing on its default branch' });
  }
  if (declaration.packs?.length === 0) {
    reasons.push({ kind: 'packs', level: 'warning', text: 'declares no packs' });
  }

  const level = reasons.length ? reasons.map((r) => r.level).sort((a, b) => levelRank(a) - levelRank(b))[0] : 'ok';

  return {
    repo,
    status: 'adopted',
    level,
    reasons,
    packs: (declaration.packs ?? []).map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean),
    declaredTasks,
    open: { total: open.length, byState, urgent: described.filter((d) => d.urgent).length },
    parked: parked.length,
    parkedHolding: holding.length,
    parkedApprovals: approvals.length,
    parkedActions: actions.length,
    parkedDecisions: decisions.length,
    parkedInbox: inbox.length,
    warned: warned.length,
    closedSeen: closed.length,
    outcomes,
    lastActivity,
    runs: runSummary,
    ci,
    stars,
    // What this member's own packs report, straight through from the read: the
    // summary judges nothing about it. A contribution never feeds a reason, a level
    // or the ranking — attention is earned by what the engine can defend, and a pack
    // cannot rank across a fleet it does not know.
    // The one item of this member's worth prodding a reader about, ranked by the same
    // rules the repo page's work table ranks by. Computed here because this is the only
    // place the described items exist, and nothing above re-reads them.
    top: pickCandidate(described.map((d) => itemCandidate(repo, d))),
    contributions: read.contributions ?? null,
    live: read.live ?? null,
    lastCommit: head?.committedAt ? ms(head.committedAt) : null,
    // Null all the way through when the read did not happen, so the row draws "not
    // read" rather than an empty quarter that reads as a repo nobody touched.
    commits: commitDays(commits, { now }),
    work: humanWork(items, prs, now),
    mount,
    schedule: declaration.taskScheduler ?? null,
  };
}

// A read that failed says something different depending on how. 404 on a repo the
// roster names is almost always "not shared with this viewer", which is a permissions
// fact rather than a fault.
function describeReadError(error) {
  const status = error?.status;
  if (status === 'budget') return 'not read — this page is holding back your last requests; sign in or wait for the reset';
  if (status === 404) return 'not visible to you — the roster names it, your credential cannot see it';
  if (status === 403) return 'forbidden — rate limit, or your credential lacks access';
  if (status === 401) return 'your credential was rejected';
  return error?.message ? `unreadable — ${error.message}` : 'unreadable';
}

// The repo's OWN CI, which is a different question from the scheduler's health: one
// says whether this project builds, the other whether Claudinite is running here. They
// are read from the same list and must never be conflated — a green scheduler on a
// repo whose tests are red is not a healthy member.
//
// The default branch's most recent completed run is the answer; a `schedule` run is
// excluded because that is the queue's own scheduler run, reported separately.
export function ciStatus(runs, defaultBranch) {
  const mine = (runs ?? []).filter((r) => r.event !== 'schedule'
    && (!defaultBranch || !r.head_branch || r.head_branch === defaultBranch));
  const inFlight = mine.some((r) => r.status === 'in_progress' || r.status === 'queued');
  const last = mine.find((r) => r.status === 'completed');
  if (!last) return { state: inFlight ? 'running' : 'unknown', at: null, name: null };
  const state = last.conclusion === 'success' ? 'passing'
    : (last.conclusion === 'cancelled' || last.conclusion === 'skipped') ? 'unknown'
      : 'failing';
  return { state: inFlight ? 'running' : state, at: ms(last.created_at), name: last.name ?? null, url: last.html_url ?? null };
}

// What is waiting on a PERSON here, as opposed to on the queue: issues that are not
// Claudinite work items, and open pull requests. Both come out of the issue page the
// row already reads, so this costs nothing and stops at that window — an issue older
// than the window is not counted, and the panel says the window is a window.
export function humanWork(items, prs, now) {
  const open = (items ?? []).filter((i) => i.state === 'open' && !isWorkItem(i));
  const oldest = (list) => list.map((i) => ms(i.created_at)).filter(Boolean).sort((a, b) => a - b)[0] ?? null;
  const openPrs = (prs ?? []).filter((p) => !p.draft);
  return {
    issues: open.length,
    issuesOldest: oldest(open),
    prs: openPrs.length,
    drafts: (prs ?? []).length - openPrs.length,
    prsOldest: oldest(openPrs),
    now,
  };
}

// The scheduler's own health. Only the workflow that drives the queue matters here —
// a failing unrelated CI run is the repo's business, not the fleet scheduler's — so
// runs are filtered to scheduled ones before anything is counted.
export function summariseRuns(runs, now) {
  const scheduled = runs.filter((r) => r.event === 'schedule');
  const completed = scheduled.filter((r) => r.status === 'completed');
  const inFlight = runs.filter((r) => r.status === 'in_progress' || r.status === 'queued').length;

  // Consecutive failures from the most recent backwards: one failure is noise, a run
  // of them is a member that has stopped working.
  let consecutiveFailures = 0;
  for (const r of completed) {
    if (r.conclusion === 'success') break;
    if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') continue;
    consecutiveFailures += 1;
  }

  const lastAt = scheduled.map((r) => ms(r.created_at)).filter(Boolean).sort((a, b) => b - a)[0] ?? null;

  return {
    scheduled: scheduled.length,
    inFlight,
    consecutiveFailures,
    lastAt,
    // No scheduled run at all is not "healthy" — it is "we have never seen this
    // member's scheduler", which the row must be able to say.
    everRan: scheduled.length > 0,
  };
}

// --- the fleet ------------------------------------------------------------------

// Worst first, then by how much is waiting. Ties break on the repo name so the order
// is stable across loads — a table that reshuffles under you is unreadable.
export function rankMembers(summaries) {
  return [...summaries].sort((a, b) =>
    levelRank(a.level) - levelRank(b.level)
    || (b.parked ?? 0) - (a.parked ?? 0)
    || (b.warned ?? 0) - (a.warned ?? 0)
    || (b.open?.total ?? 0) - (a.open?.total ?? 0)
    || a.repo.localeCompare(b.repo));
}

// The headline numbers. Each is a count of MEMBERS needing something, not a count of
// things — "3 members need you" is actionable where "47 open items" is not.
export function rollUp(summaries) {
  const adopted = summaries.filter((s) => s.status === 'adopted');
  const outcomes = { done: 0, delivered: 0, obsolete: 0, none: 0 };
  for (const s of adopted) for (const [k, v] of Object.entries(s.outcomes ?? {})) outcomes[k] += v;

  return {
    members: summaries.length,
    adopted: adopted.length,
    notAdopted: summaries.filter((s) => s.status === 'not-adopted').length,
    unreadable: summaries.filter((s) => s.status === 'unreadable').length,
    withheld: summaries.filter((s) => s.status === 'withheld').length,
    needAttention: adopted.filter((s) => levelRank(s.level) <= levelRank('serious')).length,
    parkedMembers: adopted.filter((s) => s.parked > 0).length,
    parkedItems: adopted.reduce((n, s) => n + s.parked, 0),
    parkedHolding: adopted.reduce((n, s) => n + (s.parkedHolding ?? 0), 0),
    parkedInbox: adopted.reduce((n, s) => n + (s.parkedInbox ?? 0), 0),
    parkedActions: adopted.reduce((n, s) => n + (s.parkedActions ?? 0), 0),
    parkedDecisions: adopted.reduce((n, s) => n + (s.parkedDecisions ?? 0), 0),
    parkedApprovals: adopted.reduce((n, s) => n + (s.parkedApprovals ?? 0), 0),
    warnedItems: adopted.reduce((n, s) => n + (s.warned ?? 0), 0),
    warnedMembers: adopted.filter((s) => s.warned > 0).length,
    failingMembers: adopted.filter((s) => s.runs?.consecutiveFailures > 0).length,
    neverRan: adopted.filter((s) => s.runs && !s.runs.everRan).length,
    behindMembers: adopted.filter((s) => ['behind', 'behind-engine', 'unversioned'].includes(s.mount?.state)).length,
    openItems: adopted.reduce((n, s) => n + (s.open?.total ?? 0), 0),
    inFlight: adopted.reduce((n, s) => n + (s.runs?.inFlight ?? 0), 0),
    declaredTasks: adopted.reduce((n, s) => n + (s.declaredTasks ?? 0), 0),
    outcomes,
  };
}

// --- what a person is actually holding -------------------------------------------

// What one parked item costs a person, in minutes, by WHAT THE PARK ASKS FOR (owner,
// 2026-08-22). Per kind rather than one flat rate, because the four parks are disjoint
// by remedy and cost accordingly: diagnosing a break is not merging a PR, and averaging
// them into one number made the figure mean four things at once.
//
// Keyed by the count names below, which are the triage labels one layer up:
// `broken` is `task:needs-human-failure` PLUS any park whose kind cannot be decoded
// (`parkOf` falls back to `failure`), so an unclassified park is priced as the thing
// it is treated as everywhere else.
export const PARK_MINUTES = Object.freeze({
  broken: 15,
  actions: 10,
  decisions: 3,
});

// An approval is priced by SIZE, not by kind: a two-line docs merge and a nine-file
// refactor are the same label and not the same read.
export const APPROVAL_RATE = Object.freeze({ minutes: 1, lines: 200 });

// Minutes to approve a PR of `changedLines`, or the rate's own floor when the size is
// unknown — which is every approval today, and deliberately not hidden. The page never
// reads a PR's size: `projectPull` keeps no line counts and the PRs arrive on the
// issues listing, which carries none, so a size would cost one extra request per open
// approval against `budget.mjs`'s ladder. Unknown stays unknown rather than becoming a
// zero or a guessed average: the floor is the smallest thing the rate can honestly say,
// which is what makes the total a LOWER BOUND rather than an estimate that might be high.
export const approvalMinutes = (changedLines = null) =>
  (Number.isFinite(changedLines) && changedLines > 0
    ? Math.max(1, Math.ceil((changedLines / APPROVAL_RATE.lines) * APPROVAL_RATE.minutes))
    : APPROVAL_RATE.minutes);

// ONE parked item's own minutes, from the rates above — so a figure shown against a
// single item is one term of that sum rather than a second estimate. `park` is the
// item's own classification and nothing else: whether it blocks, and its triage label.
// Anything that is not a park has no figure at all here, by the same rule that keeps
// scheduler faults and recovery-rule trips out of the total.
export function parkMinutes(park) {
  if (!park) return null;
  // An undecodable park is priced as the thing it is treated as everywhere else.
  if (park.blocking || !park.triage) return PARK_MINUTES.broken;
  if (park.triage === NEEDS_HUMAN_APPROVAL) return approvalMinutes();
  if (park.triage === NEEDS_HUMAN_ACTION) return PARK_MINUTES.actions;
  return PARK_MINUTES.decisions;
}

// The one caveat a single item's figure carries, and only the approvals carry it: the
// page never reads a PR's size, so an approval is charged the rate's floor and its
// figure can only be low. The same sentence `estimateNote` appends to a total.
export const parkMinutesNote = (park) =>
  (parkMinutes(park) != null && !park.blocking && park.triage === NEEDS_HUMAN_APPROVAL
    ? 'PR size unread, so a lower bound'
    : null);

// The vocabulary both the per-member row and the fleet rollup speak, so one function
// itemises both. Each field is a count of THINGS waiting; the two callers differ only
// in whether their things are one member's or the whole fleet's.
const attentionCounts = ({
  broken = 0, decisions = 0, actions = 0, approvals = 0, tripping = 0,
  schedulersFailing = 0, schedulersNeverRan = 0,
} = {}) => ({ broken, decisions, actions, approvals, tripping, schedulersFailing, schedulersNeverRan });

// One member's attention, in the same shape the rollup uses.
export const memberAttention = (s) => attentionCounts({
  broken: s.parkedHolding ?? 0,
  decisions: s.parkedDecisions ?? 0,
  actions: s.parkedActions ?? 0,
  approvals: s.parkedApprovals ?? 0,
  tripping: s.warned ?? 0,
});

// The fleet's. Schedulers are counted in MEMBERS here rather than in items, because a
// scheduler is a member-shaped thing — there is one per repo.
export const fleetAttention = (roll) => attentionCounts({
  broken: roll.parkedHolding,
  decisions: roll.parkedDecisions,
  actions: roll.parkedActions,
  approvals: roll.parkedApprovals,
  tripping: roll.warnedItems,
  schedulersFailing: roll.failingMembers,
  schedulersNeverRan: roll.neverRan,
});

// Minutes of a person's time the parked work represents. ONLY the parks: every minute
// in here is attributable to an item wearing a `task:status:needs-human-<kind>` label,
// which is a thing a person can see on the issue and go and do.
//
// Two things a reader might expect are deliberately outside it, for the same reason.
// Scheduler faults are not a queue of work to get through. And a recovery-rule trip is
// not waiting on a person at all: it wears no label, it is derived from an item's state
// and age against the engine's own leashes, and what clears it is the janitor or the
// next scheduler run. Both are still REPORTED, in `attentionBreakdown` beside the
// figure — they are just not minutes of anyone's time.
export function estimateMinutes(counts) {
  const c = attentionCounts(counts);
  return c.broken * PARK_MINUTES.broken
    + c.actions * PARK_MINUTES.actions
    + c.decisions * PARK_MINUTES.decisions
    + c.approvals * approvalMinutes();
}

// The sentence published beside the figure, so a reader can check the arithmetic
// instead of trusting it — and so the one thing the number cannot know says so itself.
// One definition, because both surfaces show the same total and a note that differed
// between them would be two claims about one calculation.
export const estimateNote = (counts) => {
  const c = attentionCounts(counts);
  const parts = [];
  if (c.broken) parts.push(`${PARK_MINUTES.broken}×${c.broken} broken`);
  if (c.actions) parts.push(`${PARK_MINUTES.actions}×${c.actions} action`);
  if (c.decisions) parts.push(`${PARK_MINUTES.decisions}×${c.decisions} decision`);
  if (c.approvals) parts.push(`${APPROVAL_RATE.minutes}×${c.approvals} approval`);
  if (!parts.length) return 'nothing parked';
  // The caveat rides with the approvals, because it is only about them: with no PR
  // size the rate can charge nothing above its floor, so the total can only be low.
  return parts.join(' + ') + (c.approvals ? ' · PR sizes unread, so a lower bound' : '');
};

// WHAT the human attention is, not how much of it there is. "3 members need you"
// is the length of this morning's list; it does not say whether that is three merges
// to approve or three broken lanes, and those are not the same morning.
//
// The split already exists one level down — `summariseMember` separates a failure
// park from an inbox park from an approval park precisely because a page that rings
// identically for all of them teaches its reader to ignore the ring — and the rollup
// used to throw it away and re-merge them into one word.
//
// Ordered worst first, and a kind nobody is waiting on is absent rather than zero.
export function attentionBreakdown(counts) {
  const c = attentionCounts(counts);
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  return [
    c.broken && { level: 'critical', text: `${n(c.broken, 'task', 'tasks')} broken` },
    c.schedulersFailing && { level: 'critical', text: `${n(c.schedulersFailing, 'scheduler', 'schedulers')} failing` },
    c.decisions && { level: 'serious', text: `${n(c.decisions, 'item', 'items')} needing a decision` },
    c.actions && { level: 'serious', text: `${n(c.actions, 'item', 'items')} needing something changed outside the code` },
    c.tripping && { level: 'serious', text: `${n(c.tripping, 'item', 'items')} tripping a recovery rule` },
    c.approvals && { level: 'warning', text: `${n(c.approvals, 'item', 'items')} needing approval` },
    c.schedulersNeverRan && { level: 'serious', text: `${n(c.schedulersNeverRan, 'scheduler', 'schedulers')} never ran` },
  ].filter(Boolean);
}

// Which packs the fleet uses, and how widely. Answers the question the canon actually
// asks of its fleet — "who would a change to this pack reach" — which no single
// member's page can.
export function packSpread(summaries) {
  const counts = new Map();
  for (const s of summaries) {
    for (const p of s.packs ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([pack, members]) => ({ pack, members }))
    .sort((a, b) => b.members - a.members || a.pack.localeCompare(b.pack));
}

// Which tasks are running across the fleet, from the work items themselves. A task
// declared by a shared pack runs in many members, and its fleet-wide behaviour —
// especially a task that is parked in several at once — is a canon problem rather
// than any one member's.
export function taskSpread(reads, now) {
  const byTask = new Map();
  for (const read of reads) {
    for (const item of (read.items ?? []).filter(isWorkItem)) {
      const parsed = parseWorkItemTitle(item.title);
      if (!parsed) continue;
      const key = `${parsed.pack}/${parsed.task}`;
      if (!byTask.has(key)) byTask.set(key, { key, pack: parsed.pack, task: parsed.task, members: new Set(), open: 0, parked: 0, done: 0, failed: 0 });
      const row = byTask.get(key);
      row.members.add(read.repo);
      if (item.state === 'open') {
        row.open += 1;
        if (isParked(item)) row.parked += 1;
      } else {
        const outcome = outcomeOf(item);
        if (outcome === 'done' || outcome === 'delivered') row.done += 1;
        else if (outcome !== 'obsolete') row.failed += 1;
      }
    }
  }
  return [...byTask.values()]
    .map((r) => ({ ...r, members: r.members.size }))
    .sort((a, b) => b.parked - a.parked || b.members - a.members || a.key.localeCompare(b.key));
}

export { URGENT };
