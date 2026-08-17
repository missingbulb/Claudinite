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

import { periodMs } from '../../engine/scheduler/queue/anchors.mjs';
import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN, URGENT,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE,
} from '../../engine/scheduler/queue/work-item.mjs';
import { describeItem, isWorkItem, parseWorkItemTitle, taskDeclarationPaths } from './model.mjs';

// Severity ladder, worst first. The order IS the sort, so it is stated once here
// rather than implied by comparisons scattered through the render.
export const LEVELS = ['critical', 'serious', 'warning', 'info', 'ok'];
const levelRank = (l) => {
  const i = LEVELS.indexOf(l);
  return i === -1 ? LEVELS.length : i;
};

// How far behind a member's mount may drift before it is worth saying. A converge
// runs at least daily, so a member that has not moved in a week has stopped
// converging rather than merely lagged.
export const MOUNT_STALE_MS = 7 * 86400e3;

const ms = (t) => (t == null ? null : new Date(t).getTime());

// --- mount freshness ------------------------------------------------------------

// Whether a member's mount is current. Judged on `ref` / `engineVersion` /
// `packVersions` and NEVER on `updated` alone: a held stamp pins `updated` behind a
// pending note while the mount keeps converging normally, so a member that is fine
// looks weeks stale by that field.
//
// `canon` is the reference to compare against, and it is optional — with no canon
// supplied the honest answer is `unknown`, not `current`.
export function mountState(stamp, canon = null, now = null) {
  if (!stamp) return { state: 'none', ref: null, engineVersion: null };
  const ref = stamp.ref ?? null;
  const engineVersion = stamp.engineVersion ?? null;
  const updated = stamp.updated ?? null;

  if (!canon?.ref) {
    // No reference to compare with. `updated` cannot decide freshness, but a mount
    // that has not been touched in a week says something on its own: the converge
    // itself has stopped, whatever version it stopped on.
    const age = now && updated ? ms(now) - ms(updated) : null;
    if (age !== null && age >= MOUNT_STALE_MS) {
      return { state: 'stalled', ref, engineVersion, updated, age };
    }
    return { state: 'unknown', ref, engineVersion, updated, age };
  }

  if (ref && ref === canon.ref) return { state: 'current', ref, engineVersion, updated };

  // Behind, and the engine major is the part that matters: a member a few packs
  // behind converges on its own, a member on an older engine may not be able to.
  const behindEngine = Number.isInteger(engineVersion) && Number.isInteger(canon.engineVersion)
    && engineVersion < canon.engineVersion;
  if (behindEngine) return { state: 'behind-engine', ref, engineVersion, updated };

  // Behind is routine — canon moves and members catch up within a day. Behind AND not
  // having converged in a week is not the same fact: that member is not catching up,
  // and the gap will only widen. Being behind must not mask a stopped converge.
  const age = now && updated ? ms(now) - ms(updated) : null;
  if (age !== null && age >= MOUNT_STALE_MS) return { state: 'stalled', ref, engineVersion, updated, age };

  return { state: 'behind', ref, engineVersion, updated, age };
}

// --- one member -----------------------------------------------------------------

// Everything a fleet row shows about one member, plus the reasons it needs looking
// at. `read` is what the loader managed to fetch; a member it could not read arrives
// with `error` set and every other field absent.
export function summariseMember(read, { now, canon = null } = {}) {
  const { repo, error = null, declaration = null, items = null, runs = null, paths = null } = read ?? {};

  if (error) {
    return {
      repo,
      status: 'unreadable',
      level: 'info',
      error,
      // Not being able to read a member is not the member being broken. It is almost
      // always a private repo outside this viewer's grant, so it is reported at the
      // bottom of the page rather than raised as an alarm.
      reasons: [{ level: 'info', text: describeReadError(error) }],
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
  const warned = described.filter((d) => d.state !== NEEDS_HUMAN && d.warnings.length);

  const outcomes = { [OUTCOME_DONE]: 0, [OUTCOME_DELIVERED]: 0, [OUTCOME_OBSOLETE]: 0, none: 0 };
  for (const i of closed) {
    const labels = i.labels ?? [];
    const o = [OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE].find((x) => labels.includes(x));
    outcomes[o ?? 'none'] += 1;
  }

  const lastActivity = closed
    .map((i) => ms(i.closed_at) ?? ms(i.updated_at))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] ?? null;

  const runSummary = summariseRuns(runs ?? [], now);
  const mount = mountState(declaration.claudinite, canon, now);

  const reasons = [];
  if (parked.length) {
    reasons.push({ level: 'critical', text: `${parked.length} item${parked.length > 1 ? 's' : ''} parked for a human` });
  }
  if (runSummary.consecutiveFailures > 0) {
    reasons.push({
      level: runSummary.consecutiveFailures > 1 ? 'critical' : 'serious',
      text: `scheduler last run failed${runSummary.consecutiveFailures > 1 ? ` (${runSummary.consecutiveFailures} in a row)` : ''}`,
    });
  }
  if (warned.length) {
    reasons.push({ level: 'serious', text: `${warned.length} item${warned.length > 1 ? 's' : ''} past a leash` });
  }
  if (mount.state === 'behind-engine') {
    reasons.push({ level: 'serious', text: `mount is on engine v${mount.engineVersion}, canon is v${canon?.engineVersion}` });
  } else if (mount.state === 'stalled') {
    reasons.push({
      level: 'warning',
      text: `mount has not converged in ${Math.floor(mount.age / 86400e3)} days`,
    });
  } else if (mount.state === 'behind') {
    reasons.push({ level: 'info', text: 'mount is behind canon' });
  } else if (mount.state === 'none') {
    reasons.push({ level: 'warning', text: 'declares Claudinite but carries no mount stamp' });
  }
  // A repo that declares tasks and has never produced a work item is not idle — its
  // scheduler is not running. That is invisible in every per-repo number here, which
  // is exactly why the fleet view is the place it shows up.
  if (declaredTasks !== null && declaredTasks > 0 && work.length === 0) {
    reasons.push({ level: 'serious', text: `${declaredTasks} task${declaredTasks > 1 ? 's' : ''} declared, no work item ever created` });
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
    warned: warned.length,
    closedSeen: closed.length,
    outcomes,
    lastActivity,
    runs: runSummary,
    mount,
    schedule: declaration.taskScheduler ?? null,
  };
}

// A read that failed says something different depending on how. 404 on a repo the
// roster names is almost always "not shared with this viewer", which is a permissions
// fact rather than a fault.
function describeReadError(error) {
  const status = error?.status;
  if (status === 404) return 'not visible to you — the roster names it, your credential cannot see it';
  if (status === 403) return 'forbidden — rate limit, or your credential lacks access';
  if (status === 401) return 'your credential was rejected';
  return error?.message ? `unreadable — ${error.message}` : 'unreadable';
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
  const outcomes = { [OUTCOME_DONE]: 0, [OUTCOME_DELIVERED]: 0, [OUTCOME_OBSOLETE]: 0, none: 0 };
  for (const s of adopted) for (const [k, v] of Object.entries(s.outcomes ?? {})) outcomes[k] += v;

  return {
    members: summaries.length,
    adopted: adopted.length,
    notAdopted: summaries.filter((s) => s.status === 'not-adopted').length,
    unreadable: summaries.filter((s) => s.status === 'unreadable').length,
    needAttention: adopted.filter((s) => levelRank(s.level) <= levelRank('serious')).length,
    parkedMembers: adopted.filter((s) => s.parked > 0).length,
    parkedItems: adopted.reduce((n, s) => n + s.parked, 0),
    warnedMembers: adopted.filter((s) => s.warned > 0).length,
    failingMembers: adopted.filter((s) => s.runs?.consecutiveFailures > 0).length,
    neverRan: adopted.filter((s) => s.runs && !s.runs.everRan).length,
    behindMembers: adopted.filter((s) => ['behind', 'behind-engine', 'stalled'].includes(s.mount?.state)).length,
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
        const labels = item.labels ?? [];
        if (labels.includes(OUTCOME_DONE) || labels.includes(OUTCOME_DELIVERED)) row.done += 1;
        else if (!labels.includes(OUTCOME_OBSOLETE)) row.failed += 1;
      }
    }
  }
  return [...byTask.values()]
    .map((r) => ({ ...r, members: r.members.size }))
    .sort((a, b) => b.parked - a.parked || b.members - a.members || a.key.localeCompare(b.key));
}

export { URGENT };
