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
import { periodMs } from '../../engine/scheduler/queue/anchors.mjs';
import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN, URGENT,
  NEEDS_HUMAN_APPROVAL, outcomeOf,
} from '../../engine/scheduler/queue/work-item.mjs';
import { canonicalPackVersions } from '../../engine/pack_loader/renamed-packs.mjs';
import { describeItem, isWorkItem, parseWorkItemTitle, taskDeclarationPaths } from './model.mjs';

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
export function parseEngineVersion(text) {
  const m = /ENGINE_VERSION\s*=\s*(\d+)/.exec(stripComments(String(text ?? '')));
  return m ? Number(m[1]) : null;
}

export function parsePackVersion(text) {
  const m = /(?:^|[{,\s])version:\s*(\d+)/m.exec(stripComments(String(text ?? '')));
  return m ? Number(m[1]) : null;
}

// --- mount freshness ------------------------------------------------------------

// Whether a member's mount is current. Judged on the stamp's `engineVersion` and
// `packVersions` and NEVER on `ref` or `updated`: the versioned flows stamp versions
// and nothing else, so those two hold the provenance of the last FULL re-vendor —
// a member converging nightly carries a months-old ref and updated forever, and
// judging either reads every healthy member as behind or stalled (#1065; the same
// class as #786). `updated` travels through as display-only provenance.
//
// `canon` is the reference to compare against: its live `engineVersion` and the
// canon's own per-pack versions (`packVersions`, possibly partial — the loader
// fetches only the packs members actually stamp). A pack the canon side cannot
// price is counted `unknownPacks`, never silently judged current. With no canon
// supplied the honest answer is `unknown`, not `current`.
export function mountState(stamp, canon = null) {
  if (!stamp) return { state: 'none', engineVersion: null, updated: null };
  const engineVersion = stamp.engineVersion ?? null;
  // The stamp is stored data: a pack renamed since it was written still keys its
  // version under the old spelling, which must compare rather than read as unknown.
  const packVersions = stamp.packVersions ? canonicalPackVersions(stamp.packVersions) : null;
  const updated = stamp.updated ?? null;

  if (engineVersion == null && packVersions == null) {
    // A stamp with no versions predates the versioned flows entirely — this member
    // has not converged since they landed, which is its own kind of stale.
    return { state: 'unversioned', engineVersion, updated };
  }
  if (canon?.engineVersion == null) return { state: 'unknown', engineVersion, updated };

  if (Number.isInteger(engineVersion) && engineVersion < canon.engineVersion) {
    return { state: 'behind-engine', engineVersion, canonEngineVersion: canon.engineVersion, updated };
  }

  const behindPacks = [];
  let comparedPacks = 0;
  let unknownPacks = 0;
  for (const [pack, version] of Object.entries(packVersions ?? {})) {
    const canonVersion = canon.packVersions?.[pack];
    if (canonVersion == null) { unknownPacks += 1; continue; }
    comparedPacks += 1;
    if (version < canonVersion) behindPacks.push({ pack, version, canonVersion });
  }
  if (behindPacks.length) {
    return { state: 'behind', engineVersion, behindPacks, comparedPacks, unknownPacks, updated };
  }
  return { state: 'current', engineVersion, comparedPacks, unknownPacks, updated };
}

// --- one member -----------------------------------------------------------------

// Everything a fleet row shows about one member, plus the reasons it needs looking
// at. `read` is what the loader managed to fetch; a member it could not read arrives
// with `error` set and every other field absent.
export function summariseMember(read, { now, canon = null } = {}) {
  const {
    repo, error = null, declaration = null, items = null, runs = null, paths = null,
    prs = null, head = null, stars = null, defaultBranch = null,
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
  const inbox = parked.filter((d) => !d.blockingPark && d.triage !== NEEDS_HUMAN_APPROVAL);
  const warned = described.filter((d) => d.state !== NEEDS_HUMAN && d.warnings.length);

  const outcomes = { done: 0, delivered: 0, obsolete: 0, none: 0 };
  for (const i of closed) outcomes[outcomeOf(i) ?? 'none'] += 1;

  const lastActivity = closed
    .map((i) => ms(i.closed_at) ?? ms(i.updated_at))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] ?? null;

  const runSummary = summariseRuns(runs ?? [], now);
  const ci = ciStatus(runs ?? [], defaultBranch);
  const mount = mountState(declaration.claudinite, canon);

  const n = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
  const reasons = [];
  if (holding.length) {
    reasons.push({ level: 'critical', text: `${n(holding.length, 'item')} parked broken — holding the task's lane` });
  }
  if (inbox.length) {
    reasons.push({ level: 'serious', text: `${n(inbox.length, 'item')} parked for a person — an action or a decision` });
  }
  if (approvals.length) {
    reasons.push({ level: 'warning', text: `${n(approvals.length, 'PR')} waiting for approval` });
  }
  if (runSummary.consecutiveFailures > 0) {
    reasons.push({
      level: runSummary.consecutiveFailures > 1 ? 'critical' : 'serious',
      text: `scheduler last run failed${runSummary.consecutiveFailures > 1 ? ` (${runSummary.consecutiveFailures} in a row)` : ''}`,
    });
  }
  if (warned.length) {
    reasons.push({ level: 'serious', text: `${n(warned.length, 'item')} tripping a recovery rule` });
  }
  if (mount.state === 'behind-engine') {
    reasons.push({ level: 'serious', text: `mount is on engine v${mount.engineVersion}, canon is v${canon?.engineVersion}` });
  } else if (mount.state === 'behind') {
    reasons.push({ level: 'info', text: `mount behind canon on ${mount.behindPacks.map((p) => p.pack).join(', ')}` });
  } else if (mount.state === 'unversioned') {
    reasons.push({ level: 'warning', text: 'mount stamp carries no versions — it predates the versioned update flows' });
  } else if (mount.state === 'none') {
    reasons.push({ level: 'warning', text: 'declares Claudinite but carries no mount stamp' });
  }
  // A repo that declares tasks and has never produced a work item is not idle — its
  // scheduler is not running. That is invisible in every per-repo number here, which
  // is exactly why the fleet view is the place it shows up.
  if (declaredTasks !== null && declaredTasks > 0 && work.length === 0) {
    reasons.push({ level: 'serious', text: `${declaredTasks} task${declaredTasks > 1 ? 's' : ''} declared, no work item ever created` });
  }
  if (ci.state === 'failing') {
    // The member's own CI, said in the member's own words: this is not the scheduler
    // failing, and the two must not read as the same alarm.
    reasons.push({ level: 'warning', text: 'the repo\'s own CI is failing on its default branch' });
  }
  if (declaration.packs?.length === 0) {
    reasons.push({ level: 'warning', text: 'declares no packs' });
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
    warned: warned.length,
    closedSeen: closed.length,
    outcomes,
    lastActivity,
    runs: runSummary,
    ci,
    stars,
    lastCommit: head?.committedAt ? ms(head.committedAt) : null,
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
// excluded because that is the queue's own tick, reported separately.
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
        if ((item.labels ?? []).includes(NEEDS_HUMAN)) row.parked += 1;
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
