// A discrete-event simulator of the tasks-dispatch spec (DESIGN.md), so the
// scenario play-throughs in the canon's SCENARIOS record are executable instead of prose-only.
//
// What it models faithfully: virtual time; the scheduler run as a STATELESS
// loop (decision §15.33) — at every tick it asks every task ON THE SCHEDULE
// (one stating a condition, none of which reads the item itself; a task stating
// none runs only from an item somebody created, at whose pick an empty
// expression holds), through the task's own preconditions: the run-history
// terms first (`due:`, `last-run-over:`, `last-run-not-failed`), judged over
// the task's own items in the issue store, then the scenario's precondition
// function standing for every other condition; a yes files a READY item, a no
// is a log line and nothing else, a read the scheduler cannot make fails OPEN —
// and the engine's one invariant, ONE LIVE ITEM PER TASK, with the F16 dedupe
// of live duplicates; readiness; adoption; the executing-leash reclaim), the
// executor loop (pick order, same-title mutex, the `schedule_after` yield,
// claim, validate, the pick-time re-evaluation over the item's OWN facts — a
// woken item satisfies the cadence terms — whose no-go CLOSES the item, the
// work step/hand-off/converge as timed phases, heartbeat comments during the
// work step so the leash measures executor death rather than work duration),
// at-most-once invocation (one call per item, never retried — the
// fired/refused/unanswered trichotomy of DESIGN §6.6), readiness as the
// scheduler run's alone (F1, reopened 2026-08-15, then reversed 2026-08-26 /
// #1373), the janitor's stale-ready escalation, and the force lever (waking
// where an item exists, minting where none does — both stamped `Woken`, which
// is what the cadence terms read at pick).
//
// The engine keeps NO memory of an ask: there is no schedule board, no
// watermark, no first-window booking and no migration here because there is
// none in `queue/scheduler-run.mjs` — a decline is asked again at the next
// tick, and the only record of one is the `ask` log entry this model writes for
// the line the real run prints.
//
// What it deliberately does NOT model is inventoried in README.md's "The
// unsimulated world" — one row per boundary (cron delivery, list freshness,
// label non-atomicity, comment-id ordering, event delivery, secrets, …) with
// what defends the design there. A bug living exactly on one of those
// boundaries will not surface here; executor contention IS modeled, as
// stale-snapshot races over the claim protocol (raceExecutorsAt).
//
// Time is milliseconds UTC; events run strictly in time order (FIFO within a
// tie). Nothing here sleeps, threads, or reads the wall clock.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const T = (iso) => Date.parse(iso.length === 17 ? iso.replace('Z', ':00Z') : iso);
const iso = (t) => new Date(t).toISOString().slice(0, 16) + 'Z';

// ---- the calendar (calendar.mjs, queue/anchors.mjs) --------------------------
// The cadence vocabulary a task states INSIDE its preconditions, and the anchor
// arithmetic a `due:` term measures the run history against. Daily anchors at
// 04:00Z, weekly at Sunday 04:00Z, monthly on the 1st at 04:00Z — the schedule
// defaults. mostRecentAnchor is the latest anchor ≤ now.
export const CADENCES = ['daily', 'weekly', 'monthly'];
export const DUE_TERM = 'due';
export const ELAPSED_TERM = 'last-run-over';
export const NOT_FAILED_TERM = 'last-run-not-failed';
// The terms that read the item itself (precondition-policy.mjs `needsItem`):
// only the request task's `request-eligible`. The scheduler's own ask has no
// item to judge such a term against, so a task stating one is off the schedule.
export const ITEM_TERMS = new Set(['request-eligible']);
// How far back the run history reaches (signals/index.mjs RUN_HORIZON_DAYS): a
// task with no run inside it reads as never having run.
export const RUN_HORIZON_DAYS = 40;

const ANCHOR_HOUR = 4;

export function periodMs(cadence) {
  if (cadence === 'weekly') return 7 * DAY;
  if (cadence === 'monthly') return 31 * DAY;
  if (cadence === 'daily') return DAY;
  throw new Error(`no period for ${cadence}`);
}

export function mostRecentAnchor(cadence, now) {
  if (!CADENCES.includes(cadence)) throw new Error(`no anchor for ${cadence}`);
  const d = new Date(now);
  let a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), ANCHOR_HOUR);
  if (a > now) a -= DAY;
  if (cadence === 'weekly') {
    while (new Date(a).getUTCDay() !== 0 || a > now) a -= DAY;
  }
  // Monthly: day 1 at the anchor hour, walking back a month when this month's has not come.
  if (cadence === 'monthly') {
    const d2 = new Date(a);
    a = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), 1, ANCHOR_HOUR);
    if (a > now) {
      const back = new Date(a);
      a = Date.UTC(back.getUTCFullYear(), back.getUTCMonth() - 1, 1, ANCHOR_HOUR);
    }
  }
  return a;
}

// `12h`, `1d`, `7d` — a whole number of hours or days, nothing else.
export function parseDuration(text) {
  const m = /^(\d+)(h|d)$/.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n * (m[2] === 'h' ? HOUR : DAY) : null;
}

// The grammar precondition-policy.mjs parses: entries are conjuncts, `||`
// separates alternatives inside one, the argument follows the first colon.
const alternativesOf = (entry) => String(entry ?? '').split('||').map((t) => t.trim()).filter(Boolean)
  .map((t) => { const c = t.indexOf(':'); return c === -1 ? { name: t, arg: null, text: t } : { name: t.slice(0, c).trim(), arg: t.slice(c + 1).trim(), text: t }; });
const entriesOf = (preconditions) => (Array.isArray(preconditions) ? preconditions : []).map(alternativesOf);

// The cadence a declaration states — the first cadence term wins; null for a
// task with no cadence term (calendar.mjs cadenceOf).
export function cadenceOf(preconditions) {
  for (const ref of entriesOf(preconditions).flat()) {
    if (ref.name === DUE_TERM && CADENCES.includes(ref.arg)) return { kind: 'due', cadence: ref.arg };
    if (ref.name === ELAPSED_TERM) {
      const ms = parseDuration(ref.arg);
      if (ms) return { kind: 'elapsed', ms, text: ref.arg };
    }
  }
  return null;
}

// Whether the declaration states any condition at all (calendar.mjs
// statesConditions): absent or empty, the task is off the schedule — the
// scheduler never asks it, and it runs only from an item somebody created, at
// whose pick an empty expression holds.
export const statesConditions = (preconditions) => entriesOf(preconditions).length > 0;

// ON THE SCHEDULE (task-contract.mjs isScheduledTask): the task states a
// condition, and none of them reads the item itself — there is no item at the
// scheduler's own ask to judge such a term against.
export const isScheduled = (preconditions) =>
  statesConditions(preconditions) && !entriesOf(preconditions).flat().some((ref) => ITEM_TERMS.has(ref.name));

// The period a TASK keeps (queue/anchors.mjs taskPeriodMs): its `due:` cadence's
// period, its `last-run-over:` duration, null for a task with no cadence term.
export const taskPeriodMs = (preconditions) => {
  const cadence = cadenceOf(preconditions);
  if (cadence?.kind === 'due') return periodMs(cadence.cadence);
  if (cadence?.kind === 'elapsed') return cadence.ms;
  return null;
};

// THE FREQUENCY DOOR (task-contract.mjs normalizeTaskDeclaration). `frequency`
// is retired: a declaration still carrying it reads as the cadence term it
// always meant, first in the expression, and a `none` beside it drops. A
// retired spelling (`hourly`, `daily-2h`) is refused outright — the legacy map
// is empty (#1234) — where the engine's declaration check would refuse it at
// authoring time.
export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'manual'];
// What the field always meant, as the term that now says it — or null for
// `manual`, which meant no schedule at all and so adds no term.
export const cadenceTermFor = (frequency) => (frequency === 'manual' ? null : `${DUE_TERM}:${frequency}`);

// The load point — the sim's equivalent of `normalizeTaskDeclaration` plus the
// declaration check. The sim's `preconditions` carries the run-history terms it
// evaluates itself, plus an item-reading term the scenario's `precondition`
// function stands for; that function stands for every other condition the real
// declaration would name too, so a term outside that vocabulary is a scenario
// error here rather than a fail-open.
export function loadDeclaration(decl) {
  const out = { ...decl };
  if (out.frequency !== undefined) {
    if (!FREQUENCIES.includes(out.frequency)) {
      throw new Error(`${out.id}: "${out.frequency}" is not a frequency the door accepts — a retired spelling is refused, not normalized`);
    }
    const stated = (Array.isArray(out.preconditions) ? out.preconditions : []).filter((e) => String(e).trim() !== 'none');
    const term = cadenceTermFor(out.frequency);
    out.preconditions = term === null || stated.some((e) => String(e).trim() === term) ? stated : [term, ...stated];
    delete out.frequency;
  }
  // An absent `preconditions` stays absent, as through the engine's door; the
  // grammar reads absent and empty alike as stating nothing.
  for (const alts of entriesOf(out.preconditions)) {
    for (const ref of alts) {
      const legal = (ref.name === DUE_TERM && CADENCES.includes(ref.arg))
        || (ref.name === ELAPSED_TERM && parseDuration(ref.arg) !== null)
        || (ref.name === NOT_FAILED_TERM && ref.arg === null)
        || (ITEM_TERMS.has(ref.name) && ref.arg === null);
      if (!legal) {
        throw new Error(`${out.id}: "${ref.text}" is not a term the simulator models (${DUE_TERM}:<${CADENCES.join('|')}>, ${ELAPSED_TERM}:<Nh|Nd>, ${NOT_FAILED_TERM}, ${[...ITEM_TERMS].join(', ')}) — a scenario's precondition function stands for every other condition`);
      }
    }
    // An item-reading term is judged by the scenario's precondition function,
    // which stands for the engine's term — as a whole conjunct only, or the
    // alternative it sits in has no judge here.
    if (alts.length > 1 && alts.some((ref) => ITEM_TERMS.has(ref.name))) {
      throw new Error(`${out.id}: "${alts.map((r) => r.text).join(' || ')}" mixes an item-reading term into an alternative — the simulator judges such a term only as a whole conjunct`);
    }
  }
  return out;
}

// ---- the run-history terms (precondition-policy.mjs BUILTIN_TERMS) -----------
// Judged over `runs` — this task's own unqualified items, newest first, the item
// under evaluation excluded — and the item's facts. A person's wake stands in
// for the cadence: `due:` and `last-run-over:` hold on a woken item, and ONLY
// those two — `last-run-not-failed` reads the newest run whatever woke this one.
function termHolds(ref, runs, item, now) {
  const woken = item?.woken === true;
  const newest = runs[0] ?? null;
  if (ref.name === DUE_TERM) {
    if (woken) return { holds: true, reason: `#${item.number} was woken by hand — the wake stands in for the cadence` };
    const anchor = mostRecentAnchor(ref.arg, now);
    // Both halves of the old occurrence guard (F13): an item CREATED since the
    // anchor is this period's, and so is one CLOSED since it.
    const since = runs.find((r) => r.createdAt >= anchor || (r.closedAt ?? -Infinity) >= anchor);
    return since
      ? { holds: false, reason: `#${since.number} already ran since the ${ref.arg} anchor at ${iso(anchor)}` }
      : { holds: true, reason: `no run since the ${ref.arg} anchor at ${iso(anchor)}` };
  }
  if (ref.name === ELAPSED_TERM) {
    if (woken) return { holds: true, reason: `#${item.number} was woken by hand — the wake stands in for the cadence` };
    if (!newest) return { holds: true, reason: `no run of this task in the last ${RUN_HORIZON_DAYS} days` };
    return now - newest.createdAt > parseDuration(ref.arg)
      ? { holds: true, reason: `the newest run, #${newest.number}, started over ${ref.arg} ago` }
      : { holds: false, reason: `the newest run, #${newest.number}, started inside ${ref.arg}` };
  }
  if (ref.name === NOT_FAILED_TERM) {
    if (!newest) return { holds: true, reason: 'no run of this task to have failed' };
    return newest.park === 'failure'
      ? { holds: false, reason: `the newest run, #${newest.number}, stands at a failure park — this task declares it does not run past its own failure` }
      : { holds: true, reason: `the newest run, #${newest.number}, did not fail` };
  }
  throw new Error(`unknown run-history term "${ref.text}"`);
}

// The conjunction: every entry needs one holding alternative. The scenario's
// precondition function is a further conjunct the caller judges after this one
// says yes — exactly the engine's two-pass ask — and it is also what stands for
// an item-reading term, so that conjunct is left to it. An empty expression
// holds: the item itself is the ask.
export function judgeHistory(preconditions, runs, item, now) {
  const held = [];
  let delegated = false;
  for (const alts of entriesOf(preconditions)) {
    if (alts.length === 1 && ITEM_TERMS.has(alts[0].name)) { delegated = true; continue; }
    const outs = alts.map((ref) => termHolds(ref, runs, item, now));
    const winner = outs.find((o) => o.holds);
    if (!winner) return { run: false, reason: outs.map((o) => o.reason).join('; nor ') };
    held.push(winner.reason);
  }
  if (held.length) return { run: true, reason: held.join('; ') };
  return { run: true, reason: delegated ? '' : 'no conditions stated — the item itself is the ask' };
}

// ---- the simulator ----------------------------------------------------------

// ---- the label vocabulary (DESIGN §4; the vocabulary migration, #1119) ------
// The sim WRITES canonical spellings only and DECODES every spelling ever
// written: open items created by a fielded engine wear the old labels, and the
// mechanism must react to them exactly as to its own. statusOf is that decode —
// one pass, straight to today's spelling.
export const STATUS_PREFIX = 'task:status:';
export const READY = 'task:status:waiting-for-executor';
export const NH = (kind) => `task:status:needs-human-${kind}`;
export const ORIGIN_PLANNED = 'task:origin:planned';
export const ORIGIN_AD_HOC = 'task:origin:ad-hoc';
export const ORIGIN_GITHUB = 'task:origin:github';
const TRIAGE = ['action', 'decision', 'approval', 'failure'];
// The four statuses an OPEN item may wear before it parks or converges — what
// "one live item per task" counts (work-item.mjs LIVE_STATUSES).
const LIVE_STATUSES = ['task:status:blocked', READY, 'task:status:running-executor', 'task:status:running-agent'];
// Legacy flat spellings → canonical. The legacy two-label park pair is handled
// in statusOf ahead of these (the sub-label decides; bare or unknown reads as
// failure, the conservative lane), because an old park kept its pair beside
// whatever state label a torn transition left behind.
const LEGACY_STATUS = new Map([
  ['task:blocked', 'task:status:blocked'],
  ['task:ready', READY],
  ['task:executing', 'task:status:running-executor'],
  ['task:agent', 'task:status:running-agent'],
  ['task:done', 'task:status:done'], ['outcome:done', 'task:status:done'],
  ['task:obsolete', 'task:status:rejected'], ['outcome:obsolete', 'task:status:rejected'],
]);
export function statusOf(i) {
  for (const l of i.labels) if (l.startsWith(STATUS_PREFIX)) return l;
  for (const l of i.labels) {
    const m = /^task:needs-human-(.+)$/.exec(l);
    if (m) return NH(TRIAGE.includes(m[1]) ? m[1] : 'failure');
  }
  if (i.labels.has('needs-human')) return NH('failure');
  for (const l of i.labels) { const c = LEGACY_STATUS.get(l); if (c) return c; }
  return null;
}
export const REQUEST_TASK = 'engine/implement-request';
export const MODEL_FAMILIES = ['opus', 'sonnet', 'haiku'];
export const DEFAULT_MODEL = 'opus';
// Push permission, read from the permission API (F30). The payload's
// `author_association` alone is broader than push — MEMBER is any org member and
// COLLABORATOR includes read-only collaborators — so it may prefilter, but the
// verdict is the permission read, which is what the sim models.
export const PUSH_PERMISSIONS = ['admin', 'maintain', 'write'];
export const APPROVAL_RE = /^\s*\/claude\s+go\b/im;

// Eligibility over one request's payload — the built-in precondition's core,
// modeled here in the shape the engine will carry it: candidate logins (the
// author, then approving commenters) judged by their permission on the repo.
export function eligible(req, permissionOf) {
  if (PUSH_PERMISSIONS.includes(permissionOf(req.author))) return { ok: true, why: `opened by ${req.author}, who has push access` };
  const approval = (req.comments ?? []).find((c) => APPROVAL_RE.test(c.body ?? '') && PUSH_PERMISSIONS.includes(permissionOf(c.login)));
  if (approval) return { ok: true, why: `approved by ${approval.login} with /claude go` };
  return { ok: false, why: 'neither opened nor approved by anyone with push access' };
}

// The model a request asks for — a BODY parameter now, not a label, honored
// only when the issue AUTHOR holds push access (the body is author-editable
// where a label is write-gated). An unrecognized family falls back to the
// default rather than to nothing — a request nobody can run would look
// accepted forever — and an ungated author's ask runs at the default too.
export function gatedModel(req, permissionOf) {
  if (!PUSH_PERMISSIONS.includes(permissionOf(req.author))) return DEFAULT_MODEL;
  return MODEL_FAMILIES.includes(req.model) ? req.model : DEFAULT_MODEL;
}

export function makeSim({
  tasks,
  schedulerRunMinute = 17,
  // The UTC hours the cron fires on — `null` is the every-hour grid. A member's
  // real cron names its hours explicitly (the anchor tick plus the ad-hoc drain
  // tick), and what that costs and delays is the whole question S67-S70 ask.
  cronHours = null,
  executingLeashMs = 1 * HOUR,
  agentLeashMs = 3 * HOUR,
  heartbeatMinutes = 15, // the executor's activity comment cadence during the work step
  pickSeed = 1, // seed for the randomized pick order, so scenarios replay identically
  staleReadyPeriods = 2,
  staleBlockedMs = 2 * DAY,
  heartbeatsDisabled = false, // S31b only: demonstrate the livelock heartbeats prevent
  collaborators = { owner: 'admin' }, // login -> repo permission, as the permission API answers (F30)
} = {}) {
  // An empty list is never "the default grid" — it is a cron that never fires, and
  // a scenario that asked for one would assert against a world where nothing runs
  // and every assertion about latency passes vacuously.
  if (cronHours !== null) {
    if (!Array.isArray(cronHours) || cronHours.length === 0) {
      throw new Error('cronHours must be a non-empty array of UTC hours, or null for the every-hour grid');
    }
    if (!cronHours.every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) {
      throw new Error(`cronHours must be integers in 0..23, got ${JSON.stringify(cronHours)}`);
    }
  }

  // The load point: every declaration passes the frequency door and the
  // run-history vocabulary check once, so nothing downstream ever sees a
  // `frequency` or an unmodeled term.
  const registry = new Map(tasks.map((t) => { const d = loadDeclaration(t); return [d.id, d]; }));
  const permissionOf = (login) => collaborators[login] ?? 'none';
  // Ordinary issues somebody marked. Under the one-issue model the marked
  // issue BECOMES the work item at adoption — the item record shares the
  // issue's label Set, so a status written on one is written on both, which is
  // the artifact-level truth of "the issue is the item".
  const requests = []; // {number,labels:Set,state,author,model,unreadable,comments:[{login,body}]}
  // A deleted issue ('gone') is invisible here, exactly as a 404 makes it: the
  // precondition sees "does not exist", and no write-back can reach it.
  const requestOf = (n) => requests.find((r) => r.number === n && r.state !== 'gone') ?? null;
  const titleOf = (id) => `[claudinite-work] ${id}`;

  // The built-in request task, always present wherever the queue runs (DESIGN
  // §16.2): its one condition, `request-eligible`, reads the item it is about, so
  // the task is off the schedule — the scheduler run never asks it, and an item
  // exists only because an issue was marked. That condition IS the security
  // check, and the task declares no code-work at all, so a request goes issue →
  // item → agent with nothing in between to carry a payload.
  registry.set(REQUEST_TASK, {
    id: REQUEST_TASK,
    preconditions: ['request-eligible'],
    agentMinutes: 45,
    ceiling: 'pr',
    deliversOpenPr: () => true,           // every successful run leaves a PR to review
    // The judgment `request-eligible` makes, evaluated at pick like every other
    // condition — over THIS item, because which request it is about is a
    // property of the item, not of the task.
    precondition: (_world, _now, item) => {
      const req = requestOf(item?.request);
      // Transiently unreadable is NOT a verdict (F27): a decline's write-back
      // cannot reach an issue it cannot read, so declining here would strand
      // `claude-queued` forever over nothing. It surfaces as a run FAILURE —
      // the executor parks the item in the failure lane, open and retryable.
      if (req?.unreadable) return { error: `issue #${req.number} could not be read — refusing to guess` };
      if (!req) return { run: false, reason: `issue #${item?.request} does not exist` };
      if (req.state !== 'open') return { run: false, reason: `issue #${req.number} was closed before this ran` };
      if (!req.labels.has(ORIGIN_AD_HOC)) return { run: false, reason: `issue #${req.number} no longer carries the mark — the request was withdrawn` };
      const verdict = eligible(req, permissionOf);
      return verdict.ok
        ? { run: true, reason: `#${req.number}: ${verdict.why}` }
        : { run: false, reason: `#${req.number}: ${verdict.why}` };
    },
  });

  // F17, reframed by the work-as-work review (2026-08-15): the leash no longer
  // has to exceed every task's work bound — heartbeat comments during the work
  // step keep a LIVE executor's item out of the reclaim, however long the work
  // runs, so the leash measures executor death, not work duration. The wiring
  // constraint that remains is the one the heartbeat itself needs: the
  // heartbeat interval must sit well inside the leash, or every heartbeat
  // arrives too late to matter.
  if (heartbeatMinutes * MIN >= executingLeashMs) {
    throw new Error(
      `heartbeat interval (${heartbeatMinutes}m) reaches the executing leash — F17 (reframed)`);
  }

  const issues = []; // {number,title,taskId,qualifier,labels:Set,state,createdAt,closedAt,readySince,lastActivity,notBefore,blockedBy:[],outcome,woken,comments:[],escalated,sessions:[],quarantined}
  const log = []; // {t,kind,task,issue,...}

  // Which tasks the scheduler cannot collect signals for (a missing
  // credential) — the fail-open lever the scenarios pull. It bites only where
  // the run-history terms did not already decide: those are judged first, off
  // the issue store the run already holds, and cost no other read.
  const signalsUnavailable = new Set();
  // The issue-creation API refuses the next create for these tasks (a 4xx/5xx
  // on the POST) — the write-failure half of F31's scenario.
  const failNextCreateOf = new Set();
  const world = {}; // scenario-owned signal state, read by precondition fns
  const queue = []; // {t,seq,fn}
  let seq = 0;
  let now = 0;
  let sessionSeq = 0;
  // Randomized pick order (owner, 2026-08-15) wants randomness; reproducible
  // tests want determinism. A seeded LCG gives both.
  let prngState = pickSeed >>> 0;
  const prng = () => (prngState = (prngState * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  // CLAUDINITE_TASKS_SUSPEND_ALL (owner, 2026-08-16): a repo Actions variable
  // every Claudinite workflow checks as its FIRST act — when true, the run
  // exits cleanly and fires nothing, so the train parks at most one hop after
  // suspension. Gates workflow STARTS only: in-flight runs and agent sessions
  // finish on their own, and items freeze in place with no labels touched.
  let suspendedAll = false;
  const crashNextOf = new Set(); // taskIds whose next execution dies mid-claim
  const crashDuringWorkOf = new Map(); // taskId -> minutes into the work step the runner dies
  const crashAgentOf = new Set(); // taskIds whose next agent session dies mid-run

  const schedule = (t, fn) => queue.push({ t, seq: seq++, fn });
  const record = (kind, extra) => log.push({ t: now, at: iso(now), kind, ...extra });

  const open = () => issues.filter((i) => i.state === 'open');
  const has = (i, l) => i.labels.has(l);
  // The ORIGIN LABEL is the authority on standing vs ad-hoc (DESIGN §3, owner
  // 2026-08-20, reversing 2026-08-19's marker-free rule): `task:origin:planned`
  // marks the task's calendar occurrence, everything else is ad-hoc. The
  // structural read — bare unqualified title of a scheduled task at HEAD —
  // survives only as the decode fallback for items that predate the scheme and
  // carry no origin at all.
  const family = (taskId) => issues.filter((i) => i.title === titleOf(taskId));
  const isStanding = (i) => {
    const o = originOf(i);
    if (o) return o === ORIGIN_PLANNED;
    const task = registry.get(i.taskId);
    return !!task && isScheduled(task.preconditions) && i.qualifier === null && i.title === titleOf(i.taskId);
  };
  const standingItem = (taskId) => family(taskId).find((i) => i.state === 'open');

  // A park is ONE label (DESIGN §4, the vocabulary migration): the machine
  // filters on the `task:status:needs-human-` prefix and a person reads the
  // kind off the same label's tail. The legacy two-label pair decodes through
  // statusOf, modeled there because that is what old items actually wear —
  // modeling only the intent is the blind spot that hid F24.
  const triageLabel = (kind) => NH(TRIAGE.includes(kind) ? kind : 'failure');
  const park = (it, _from, kind) => setStatus(it, triageLabel(kind));
  // The road back clears the status, restoring the no-status shape; the
  // re-queue lever then applies the ready status explicitly.
  const unpark = (it) => clearStatus(it);
  const isParked = (i) => (statusOf(i) ?? '').startsWith(NH(''));
  const parkKindOf = (i) => (isParked(i) ? statusOf(i).slice(NH('').length) : null);
  const isLive = (i) => LIVE_STATUSES.some((s) => statusOf(i) === s);

  function createIssue({ taskId, labels, notBefore = null, blockedBy = [], urgent = false, qualifier = null, request = null, model = null, origin = ORIGIN_PLANNED, woken = null }) {
    const it = {
      request, model,
      number: issues.length + 900,
      title: titleOf(taskId) + (qualifier ? ` ${qualifier}` : ''),
      taskId, qualifier,
      labels: new Set(labels.concat(urgent ? ['task:urgent'] : []).concat(origin ? [origin] : [])),
      state: 'open',
      createdAt: now, closedAt: null,
      readySince: labels.includes('task:status:waiting-for-executor') ? now : null,
      lastActivity: now,
      notBefore, blockedBy,
      // `Woken:` (DESIGN §5, §8): the instant a lever created or woke this item
      // by hand — null on the scheduler's own item, which no lever touched.
      woken,
      outcome: null, comments: [], escalated: false,
      sessions: [], quarantined: false,
    };
    issues.push(it);
    record('create', { task: taskId, issue: it.number });
    return it;
  }

  // Statuses are mutually exclusive: a write clears every spelling of every
  // status — canonical, legacy flat, legacy pair — before adding the new one,
  // so a decoded legacy item comes out canonical from its first transition.
  function clearStatus(it) {
    for (const l of [...it.labels]) {
      if (l.startsWith(STATUS_PREFIX) || LEGACY_STATUS.has(l)
        || l === 'needs-human' || l.startsWith('task:needs-human-')) it.labels.delete(l);
    }
  }
  function setStatus(it, to) {
    clearStatus(it);
    it.labels.add(to);
    it.readySince = to === READY ? now : null;
    it.lastActivity = now;
  }
  const is = (i, status) => statusOf(i) === status;
  const originOf = (i) => [...i.labels].find((l) => l.startsWith('task:origin:')) ?? null;

  // ---- the run history (signals/index.mjs `runs`; queue/signals.mjs) ---------
  // This task's own unqualified items over the horizon, newest first, the item
  // under evaluation excluded — what the cadence terms and the since-last-run
  // window read. "Newest" is creation order, which is what GitHub's issue
  // numbering guarantees and the sim's per-lever number ranges do not.
  // A run begins at the pick: an item still wearing the status it waited in —
  // open, or closed beside the terminal label (`closeUnpicked`) — was never
  // picked, so it is not a run; else twins decline each other at pick and a
  // deduped one spends the period on the survivor (F32).
  const unpicked = (i) => i.labels.has('task:status:blocked') || i.labels.has(READY);
  const runsOf = (taskId, exclude = null) => family(taskId)
    .filter((i) => i.number !== exclude && !unpicked(i)
      && Math.max(i.createdAt, i.closedAt ?? 0, i.lastActivity ?? 0) >= now - RUN_HORIZON_DAYS * DAY)
    .map((i) => ({
      number: i.number, createdAt: i.createdAt, closedAt: i.closedAt, state: i.state,
      status: statusOf(i), park: parkKindOf(i), outcome: i.outcome, woken: i.woken != null,
    }))
    .sort((a, b) => b.createdAt - a.createdAt || b.number - a.number);
  // The window every other collector reads over: since this task's newest run
  // that actually ran STARTED — a `rejected` item declined at pick and did
  // nothing, so it does not move the seam — falling back to the task's own
  // cadence plus an hour of slack (a day for a task stating none).
  const defaultWindowMs = (task) => (taskPeriodMs(task.preconditions) ?? DAY) + HOUR;
  const windowOf = (task, exclude = null) => {
    const last = runsOf(task.id, exclude).find((r) => r.outcome !== 'rejected');
    const since = last ? last.createdAt : now - defaultWindowMs(task);
    return { since, days: (now - since) / DAY };
  };
  // THE ITEM'S OWN FACTS (work-item.mjs itemFacts): `woken` is everything that is
  // NOT the scheduler's own ask — stamped by a lever, born ad-hoc, a request, or
  // any qualified item. The scheduler files only unqualified planned items.
  const itemFacts = (it) => {
    const schedulesOwn = it.request == null && it.qualifier === null && originOf(it) !== ORIGIN_AD_HOC;
    return { number: it.number, request: it.request, woken: it.woken != null || !schedulesOwn };
  };

  // THE ASK, the scheduler's (queue/scheduler-run.mjs `evaluate`): the
  // run-history terms alone first — a decline there costs no other read, and
  // signals being unavailable cannot touch it — then the scenario's precondition
  // function over the world. Any read the scheduler cannot make fails OPEN.
  function askAtTick(task) {
    const history = judgeHistory(task.preconditions, runsOf(task.id), null, now);
    if (!history.run) return { verdict: 'no', reason: history.reason };
    if (!task.precondition) return { verdict: 'go', reason: history.reason };
    if (signalsUnavailable.has(task.id)) return { verdict: 'fail-open', reason: 'signals unavailable to the scheduler' };
    let verdict;
    try { verdict = task.precondition(world, now, null, windowOf(task)) ?? {}; }
    catch (e) { verdict = { error: `precondition threw: ${e.message}` }; }
    if (verdict.error) return { verdict: 'fail-open', reason: verdict.error };
    if (verdict.run === false) return { verdict: 'no', reason: verdict.reason ?? 'no work' };
    return { verdict: 'go', reason: [history.reason, verdict.reason].filter(Boolean).join('; ') };
  }
  // THE ASK, the executor's (DESIGN §6.4): the whole expression over the item's
  // own facts and its own run history — excluding it — where a woken item
  // satisfies the cadence terms and everything else still applies. A throw here
  // is a DECLINE (the engine's evaluatePrecondition catches it) — one task's bad
  // verdict is that item's problem, never the executor's; only the tick-side
  // ask fails open.
  function askAtPick(task, it) {
    const history = judgeHistory(task.preconditions, runsOf(it.taskId, it.number), itemFacts(it), now);
    if (!history.run) return history;
    if (!task.precondition) return { run: true, reason: history.reason };
    let verdict;
    try { verdict = task.precondition(world, now, it, windowOf(task, it.number)) ?? {}; }
    catch (e) { return { run: false, reason: `precondition threw: ${e.message}` }; }
    // A go carries every held reason, joined as the engine's verdict joins them;
    // a decline or an error is the precondition's own, untouched.
    if (verdict.error || verdict.run === false) return verdict;
    return { ...verdict, run: true, reason: [history.reason, verdict.reason].filter(Boolean).join('; ') };
  }

  // F18/F24: the episode boundary is an ARTIFACT on the item, not a property of
  // the label transition. Modelling it as "every transition into ready opens a
  // new episode" is what made this simulator unable to reproduce F24: it encoded
  // the rule's intent, so the paths that end an episode without writing anything
  // looked correct here and livelocked in production. So the epoch advances
  // exactly where the engine leaves a mark — the scheduler run's reclaim, the F15 revert,
  // and the departing executor's strike on a roll or a park (DESIGN §6.2).
  //
  // A human re-queue deliberately does NOT advance it: a human editing labels
  // writes no comment, which is precisely why the strike has to have happened
  // already.
  function endEpisode(it) { it.claimEpoch = seq++; }

  // `dispatchDrain: false` is for closes whose caller already has a drain
  // coming — the executor's own loop picks the next item in the same run, and
  // the scheduler run's dedupe close is followed by that run's drain job —
  // so only a close with no run behind it (an agent session's) dispatches one.
  // What still makes something newly pickable after such a close is the
  // `schedule_after` yield resolving (§9) — never a Blocked-by dependent, which
  // a close no longer touches at all (§15.19, reversed by §15.31 / #1373): that
  // release is the scheduler run's readiness job alone, on its own hourly pass.
  function close(it, outcome, { dispatchDrain = true } = {}) {
    it.state = 'closed';
    it.closedAt = now;
    it.outcome = outcome;
    // the terminal status goes ON; urgency ends with the item; the ORIGIN stays
    // for life — the closed issue keeps saying where it came from
    clearStatus(it);
    it.labels.delete('task:urgent');
    it.labels.add(outcome === 'done' ? 'task:status:done' : 'task:status:rejected');
    record('close', { task: it.taskId, issue: it.number, outcome });
    if (dispatchDrain && pickable().length > 0) {
      schedule(now + 1 * MIN, () => executorRun('E1', 'close-drain'));
    }
  }

  // The scheduler run's own close of an item nobody picked (the F16 dedupe;
  // scheduler-run.mjs's `dedupe`/`retire-orphan`/`superseded` ops): it ADDS the
  // terminal label and closes, and the status the item waited in stays on — which
  // is exactly what the run history reads to know the item never ran (F32).
  function closeUnpicked(it) {
    it.state = 'closed';
    it.closedAt = now;
    it.outcome = 'rejected';
    it.labels.add('task:status:rejected');
    record('close', { task: it.taskId, issue: it.number, outcome: 'rejected' });
  }

  // ---- the scheduler run (DESIGN §5, §15.33): a stateless loop --------------
  function schedulerRun() {
    if (suspendedAll) { record('suspended-skip', { workflow: 'scheduler-run' }); return; }
    record('scheduler-run', {});
    // job 1: ASK every task on the schedule, at every tick. A yes files a READY
    // item; a no is the `ask` log entry and nothing else — no board, no
    // watermark, nothing durable can eat a run, and the next tick asks again; a
    // read the scheduler cannot make fails OPEN and the executor decides at pick.
    for (const task of registry.values()) {
      // A task off the schedule — stating no condition, or one that reads the
      // item itself — runs only from an item somebody created (DESIGN §5, §8):
      // the schedule never asks it.
      if (!isScheduled(task.preconditions)) continue;
      // ONE LIVE ITEM PER TASK, the engine's one invariant: an open item that is
      // blocked, waiting or running is the task's current occurrence, and the
      // task is not asked while it stands. A PARKED item is not live — it is a
      // person's inbox or a fault on record — and whether it holds the task is
      // the task's own declaration (`last-run-not-failed`), never the engine's:
      // absent that term the next occurrence is filed beside the park, which the
      // dedupe below must never mistake for a duplicate.
      const live = family(task.id).filter((i) => i.state === 'open' && isLive(i))
        .sort((a, b) => a.number - b.number);
      // F16 self-heal, FIRST: if a stale issue list ever let a duplicate
      // standing item through (nothing guarantees a REST list from another node
      // sees a creation seconds old), close every live one but the oldest. The
      // scheduler run is serialized (concurrency group), so this cannot race itself.
      for (const dup of live.slice(1)) {
        closeUnpicked(dup);
        record('dedupe', { task: task.id, issue: dup.number });
      }
      if (live.length > 0) continue; // the standing item already exists
      const { verdict, reason } = askAtTick(task);
      record('ask', { task: task.id, verdict, reason });
      if (verdict === 'no') continue; // no work, no item, nothing written
      if (failNextCreateOf.delete(task.id)) {
        record('create-failed', { task: task.id });
        continue; // the POST was refused; nothing exists, and the next tick asks again
      }
      createIssue({ taskId: task.id, labels: ['task:status:waiting-for-executor'] });
    }
    // job 2: ready whatever is due
    for (const it of open().filter((i) => is(i, 'task:status:blocked'))) {
      const blockersDone = it.blockedBy.every(
        (n) => issues.find((x) => x.number === n)?.state === 'closed'
      );
      if (blockersDone && (it.notBefore === null || now >= it.notBefore)) {
        setStatus(it, 'task:status:waiting-for-executor');
        record('ready', { task: it.taskId, issue: it.number });
      }
    }
    // ---- job 4: adopt the marked issues (DESIGN §16.3, one-issue) ----------
    // Label mechanics like the other three: no precondition, no signal, no
    // judgment about WHO marked it (that is the precondition's, at pickup).
    // The marked issue IS the work item. The exactly-once guard is the mark
    // with NO status: adoption writes the first status, and any status — live,
    // parked or terminal — blocks re-adoption until a person clears it, which
    // makes clearing the status the ONE re-ask lever (§4's re-queue and §16.3's
    // re-mark used to be two; the one-issue shape collapses them).
    for (const req of requests.filter((r) => r.state === 'open'
        && r.labels.has(ORIGIN_AD_HOC) && statusOf(r) === null)) {
      const prior = issues.find((i) => i.request === req.number);
      if (prior) {
        // the same record re-enters the queue — a cleared park or a cleared
        // terminal is a re-ask, and the engine's write marks the episode. The
        // model is re-gated from the body as it stands NOW: each ask names its
        // model afresh, and nothing stale outranks it (F29's guarantee, kept
        // without any label to consume).
        prior.model = gatedModel(req, permissionOf);
        prior.state = 'open'; prior.closedAt = null; prior.outcome = null;
        setStatus(prior, READY);
        endEpisode(prior);
        record('adopt', { task: REQUEST_TASK, issue: prior.number, request: req.number, model: prior.model, readopt: true });
        continue;
      }
      // The machine block, appended at adoption: the task path and the gated
      // parameters. The model is honored only when the AUTHOR holds push
      // access (§16.7) — the body is author-editable where a label was
      // write-gated, so an ungated ask still runs, at the default.
      const model = gatedModel(req, permissionOf);
      const it = {
        request: req.number, model,
        number: req.number, title: `request #${req.number}`, taskId: REQUEST_TASK, qualifier: null,
        labels: req.labels, // ONE issue: the item's labels ARE the issue's
        state: 'open', createdAt: now, closedAt: null,
        readySince: now, lastActivity: now,
        notBefore: null, blockedBy: [], woken: null,
        outcome: null, comments: [], escalated: false,
        sessions: [], quarantined: false,
      };
      issues.push(it);
      setStatus(it, READY);
      record('adopt', { task: REQUEST_TASK, issue: it.number, request: req.number, model });
    }
    for (const it of open().filter((i) => is(i, 'task:status:running-executor'))) {
      if (now - it.lastActivity >= executingLeashMs) {
        setStatus(it, 'task:status:waiting-for-executor');
        it.comments.push({ t: now, body: 'reclaimed: executor went silent past the leash' });
        endEpisode(it);
        record('reclaim', { task: it.taskId, issue: it.number });
      }
    }
    // The drain job (#1212): dispatched only when the scheduler run's parting
    // look at the queue found something pickable — the job output the real
    // drain job gates on. An idle hour costs the cron's one run, not two;
    // the guaranteed delivery is unchanged, because anything an event failed
    // to deliver is exactly what this look sees.
    if (pickable().length > 0) schedule(now + 40_000, () => executorRun('E1', 'scheduler-run-drain'));
    else record('drain-skipped', {});
  }

  // The two write-backs onto the request issue (DESIGN §16.5). Whoever converges
  // the item owns the write-back for the end it converged: the executor for a
  // declined request, the session for a run that left a PR. A run that FAILED
  // writes nothing and leaves the queued label standing — re-arming work that
  // writes code is a person's decision, and that standing label is also what stops
  // the scheduler run adopting the same request a second time.
  // A refused request DISARMS on the issue itself (§16.5): the terminal
  // status stands on the issue — which stays whatever open/closed state its
  // author keeps it in, because the run's verdict is not the issue's validity —
  // and blocks re-adoption until a person clears it (the re-ask lever). The
  // one comment says why. There is no separate in-review write-back: the
  // approval park IS the in-review state, on the same labels.
  function declineRequest(it, why) {
    const req = requestOf(it.request);
    if (!req) return;
    req.comments.push({ login: 'claudinite', body: `declined: ${why}` });
    record('request-declined', { issue: req.number, why });
  }

  // ---- the executor (DESIGN §6) ---------------------------------------------
  function pickable() {
    const ready = open().filter((i) => is(i, 'task:status:waiting-for-executor'));
    const live = (taskId) => {
      const s = standingItem(taskId);
      return s && ['task:status:waiting-for-executor', 'task:status:running-executor', 'task:status:running-agent'].some((l) => has(s, l));
    };
    return ready
      .filter((i) => !i.quarantined) // an item no live executor can reach (S18)
      .filter((i) => {
        // same-title mutex: one task, one execution at a time
        if (open().some((o) => o !== i && o.title === i.title &&
              (is(o, 'task:status:running-executor') || is(o, 'task:status:running-agent')))) return false;
        // the `schedule_after` yield: skip while the upstream's standing item is live
        // this cycle (a declined or needs-human upstream does not block — S23)
        if (isStanding(i)) {
          const ups = registry.get(i.taskId)?.schedule_after ?? [];
          if (ups.some((up) => live(up))) return false;
        }
        return true;
      })
      .map((i) => ({ i, r: prng() }))
      // urgent first, then RANDOM among the ready (owner, 2026-08-15) — two
      // executors listing the same queue then contend on DIFFERENT heads, and
      // nothing leaned on oldest-first: the stale-ready escalation is
      // period-scale, indifferent to minute-scale pick reordering
      .sort((a, b) =>
        (has(b.i, 'task:urgent') ? 1 : 0) - (has(a.i, 'task:urgent') ? 1 : 0) ||
        a.r - b.r)
      .map(({ i }) => i);
  }

  // The claim is the verified lease (DESIGN §6.2): swap, post a claim
  // comment, re-read — earliest comment wins, the loser reverts nothing and
  // moves on. `preRead` is the label state the executor saw when it read the
  // item; a racing executor's stale read is modeled by passing the snapshot
  // taken before the rival's swap landed.
  function claim(it, execId, preRead) {
    if (statusOf({ labels: preRead }) !== READY) return false;
    setStatus(it, 'task:status:running-executor');
    it.readySince = null;
    it.lastActivity = now;
    it.comments.push({ t: now, seq: seq++, kind: 'claim', exec: execId });
    // F18: arbitrate only among THIS episode's claims — earliest since the
    // item last became ready, by server-assigned comment order
    const claims = it.comments.filter((c) => c.kind === 'claim' && c.seq > (it.claimEpoch ?? -1));
    const won = claims[0].exec === execId;
    record(won ? 'claim' : 'claim-lost', { task: it.taskId, issue: it.number, exec: execId });
    return won; // loser reverts nothing — the winner's labels already stand
  }

  // Hand-off + invocation (DESIGN §6.6, as amended 2026-08-15): swap to
  // task:status:running-agent, then fire the endpoint EXACTLY ONCE — never retried, because a
  // retry is only safe when the first call is known to have done nothing, and
  // the unanswered case is exactly where nothing can be known. Three outcomes:
  //  - fired      → a session exists; the item is the agent's
  //  - refused    → a status came back, no session exists and none will (a
  //                 token / URL / routine is wrong, which no retry fixes):
  //                 converge needs-human naming the cause
  //  - unanswered → the session may or may not exist and nothing may guess:
  //                 the item STAYS task:status:running-agent with the outcome-unknown comment;
  //                 a session that started converges it, one that never did
  //                 leaves it silent until the janitor's agent leash (§11)
  // At-most-once invocation is what deleted the agent-side claim lease: two
  // sessions can never arrive at one item, so there is nothing to arbitrate.
  function handOff(it, task) {
    setStatus(it, 'task:status:running-agent');
    if (world._apiRefusedUntil != null && now < world._apiRefusedUntil) {
      record('handoff-refused', { task: it.taskId, issue: it.number });
      park(it, 'task:status:running-agent', 'action'); // a token, a URL or a routine is wrong
      return;
    }
    if (world._apiUnanswered) {
      const { started } = world._apiUnanswered;
      world._apiUnanswered = null;
      record('handoff-unanswered', { task: it.taskId, issue: it.number, started });
      it.comments.push({ t: now, body: 'invocation got no answer — outcome unknown, the agent leash decides' });
      if (!started) return; // silent item; the janitor's agent leash is the recovery
      const s = { id: `s-${++sessionSeq}`, item: it.number };
      it.sessions.push(s);
      schedule(now + 30_000, () => startAgentSession(s, it, task));
      return;
    }
    record('handoff', { task: it.taskId, issue: it.number });
    const s = { id: `s-${++sessionSeq}`, item: it.number };
    it.sessions.push(s);
    schedule(now + 30_000, () => startAgentSession(s, it, task));
  }

  function startAgentSession(s, it, task) {
    if (it.state !== 'open' || !is(it, 'task:status:running-agent')) return;
    // No agent-side claim (DESIGN §7, amended 2026-08-15): the session checks,
    // not claims — the item wears task:status:running-agent and the fire's nonce matches the
    // newest hand-off, both modeled by the guard above.
    it.lastActivity = now;
    if (crashAgentOf.delete(it.taskId)) {
      record('agent-died', { task: it.taskId, issue: it.number, session: s.id });
      return; // never converges; the janitor's agent leash is the recovery (S11)
    }
    schedule(now + task.agentMinutes * MIN, () => {
      if (it.state !== 'open') return;
      if (task.agentFails?.(world, now)) {
        park(it, 'task:status:running-agent', 'failure');
        record('agent-failed', { task: it.taskId, issue: it.number });
        return;
      }
      // The agentic mirror of the code-work approval park below: a SESSION that
      // deliberately left an unmerged PR is in the same position as a worker that
      // did — succeeded, not finished, waiting on a named reviewer. Modeled here
      // because the request task is the first agentic task whose every successful
      // run ends that way.
      if (task.deliversOpenPr?.(world, now)) {
        park(it, 'task:status:running-agent', 'approval');
        record('delivered-open-pr', { task: it.taskId, issue: it.number });
        return;
      }
      close(it, task.outcome ?? 'done');
    });
  }

  // One claimed item through to its settle. `onSettled` is the RUN's
  // continuation — called when the item stops occupying this executor (close,
  // hand-off, work failure), and deliberately NOT called when the
  // runner itself dies (the run died with it; the leash is the recovery).
  // The hand-off settles the item for the run: the executor never waits for
  // the agent, which is why agent work parallelizes and executor work is the
  // occupancy (DESIGN §10).
  function executeClaimed(it, task, onSettled = () => {}) {
    if (crashNextOf.delete(it.taskId)) {
      record('executor-crash', { task: it.taskId, issue: it.number });
      // The workflow's failure-continuation job (needs: execute, if:
      // failure() || cancelled()) re-dispatches on a fresh runner, so a dead
      // run never stalls the train — the crashed ITEM still waits for the
      // leash reclaim; only the QUEUE keeps moving (S36).
      schedule(now + 1 * MIN, () => executorRun('E-failover', 'failure-redispatch'));
      return; // died mid-claim: labels stay, the leash reclaim recovers (S8)
    }
    // the pick-time precondition evaluation (DESIGN §6.4) — the executor
    // re-derives the verdict even where the scheduler run already asked at the
    // tick: nothing is carried forward from the tick's answer. Over the item's
    // own facts and its own run history (excluding it), so a woken item passes
    // the cadence terms and a request item's verdict is about the issue it names.
    const verdict = askAtPick(task, it);
    // A precondition that CANNOT ANSWER is a run failure, not a verdict (F27):
    // the item parks in the failure lane, open and visible, and the re-queue
    // lever retries it — where a decline would converge on a guess.
    if (verdict.error) {
      record('evaluate-failed', { task: it.taskId, issue: it.number, why: verdict.error });
      endEpisode(it);                           // F24: a park strikes its claim
      park(it, 'task:status:running-executor', 'failure');
      onSettled();
      return;
    }
    record('evaluate', { task: it.taskId, issue: it.number, run: verdict.run !== false, reason: verdict.reason ?? null });
    if (verdict.run === false) {
      // A decline CLOSES the item with the reason — standing and ad-hoc alike.
      // For a standing item the next occurrence is the scheduler run's ask at
      // the next tick, where the `due:` term's closed-at half keeps this period
      // consumed; "asked and declined" lives nowhere but this record.
      // A declined request tells the ISSUE so and disarms it, in the same
      // convergence: nothing else would, and an un-disarmed issue would be
      // re-adopted and re-refused on every scheduler run forever. The terminal
      // status stands on the still-open issue (the issue's open/closed belongs
      // to its author); a gone or already-closed issue closes the item too.
      if (it.request != null) {
        declineRequest(it, verdict.reason ?? 'the precondition declined');
        endEpisode(it);
        const req = requestOf(it.request);
        if (req && req.state === 'open') {
          setStatus(it, 'task:status:rejected');
          it.outcome = 'rejected';
        } else {
          close(it, 'rejected', { dispatchDrain: false });
        }
      } else {
        close(it, 'rejected', { dispatchDrain: false });
      }
      record('decline-close', { task: it.taskId, issue: it.number, reason: verdict.reason ?? 'no work' });
      onSettled();
      return;
    }
    // the work step → optional hand-off → converge, as timed phases. The
    // executor re-verifies its OWN lease at the transition (F17): not just "is
    // the item executing" but "is my claim still the newest" — a reclaim-then-
    // re-pick puts a newer claim on the item, and the stale runner must see
    // it and abandon silently rather than hand off work it no longer owns.
    const myClaim = it.comments.filter((c) => c.kind === 'claim').at(-1);
    const mineStill = () => it.state === 'open' && is(it, 'task:status:running-executor') &&
      it.comments.filter((c) => c.kind === 'claim').at(-1) === myClaim;
    const workMs = (task.codeWorkMinutes ?? 1) * MIN;
    const diesAtMin = crashDuringWorkOf.has(it.taskId)
      ? crashDuringWorkOf.get(it.taskId) : null;
    if (diesAtMin !== null) crashDuringWorkOf.delete(it.taskId);
    // Heartbeat comments during the work step (work-as-work review,
    // 2026-08-15): the executor touches the item every heartbeatMinutes, so
    // the leash reclaims a DEAD executor within ~leash regardless of how long
    // the work legally runs — and the item's timeline shows live progress
    // instead of going dark for the duration.
    if (!heartbeatsDisabled) {
      for (let m = heartbeatMinutes; m * MIN < workMs; m += heartbeatMinutes) {
        if (diesAtMin !== null && m >= diesAtMin) break;
        schedule(now + m * MIN, () => {
          if (!mineStill()) return;
          it.lastActivity = now;
          record('heartbeat', { task: it.taskId, issue: it.number });
        });
      }
    }
    if (diesAtMin !== null) {
      // the runner dies mid-work: heartbeats stop, the completion never runs,
      // and the leash reclaims from the LAST heartbeat — recovery is bounded
      // by the leash, not by the work's duration
      schedule(now + diesAtMin * MIN, () => {
        record('executor-crash', { task: it.taskId, issue: it.number });
        // the failure-continuation job fires here too — timeout, cancellation
        // and runner loss all run the needs:execute/if:failure() job (S36)
        schedule(now + 1 * MIN, () => executorRun('E-failover', 'failure-redispatch'));
      });
      return; // the run dies with the runner — no settle, no ordinary re-dispatch
    }
    schedule(now + workMs, () => {
      if (!mineStill()) return; // reclaimed while (presumed) dead: the run is gone
      it.lastActivity = now;
      if (task.codeWorkFails?.(world, now)) {
        endEpisode(it);                       // F24: a park strikes its claim
        // The worker's own triage marker routes the park where it left one; a
        // worker that said nothing about why it failed parks at `failure`.
        const kind = task.codeWorkTriage?.(world, now) ?? 'failure';
        park(it, 'task:status:running-executor', kind);
        record('work-failed', { task: it.taskId, issue: it.number, triage: kind });
        onSettled();
        return;
      }
      const wantsAgent = task.agentMinutes != null &&
        (task.requestsAgent ? task.requestsAgent(world, now) : true);
      if (!wantsAgent) {
        // A run that deliberately left an UNMERGED PR succeeded but is not
        // finished — it is waiting on a named reviewer, so it parks OPEN rather
        // than closing. The one park that is not a fault, and it does not hold
        // the lane: the reviewer's silence delays only the review.
        if (task.deliversOpenPr?.(world, now)) {
          endEpisode(it);                     // F24: a park strikes its claim
          park(it, 'task:status:running-executor', 'approval');
          record('delivered-open-pr', { task: it.taskId, issue: it.number });
          onSettled();
          return;
        }
        close(it, task.outcome ?? 'done', { dispatchDrain: false }); onSettled(); return;
      }
      handOff(it, task);
      onSettled(); // the hand-off ends the executor's occupancy, not the item
    });
  }

  // F15: the pick filters (same-title mutex, `schedule_after` yield) are read from
  // possibly-stale state, so two executors can pass them simultaneously and
  // claim DIFFERENT items that the filters should have serialized — a twin
  // pair, or an upstream and its dependent. The lease protects one item, not
  // one title. So after WINNING a claim, re-verify the filters against live
  // state: if a conflicting item now holds an EARLIER claim (comment order —
  // the same arbiter the lease trusts), revert this claim to task:status:waiting-for-executor and
  // move on. Bounded (one revert), deterministic (comment order), and the
  // earlier claim never even notices.
  function postClaimVerify(it, execId) {
    const myClaim = it.comments.filter((c) => c.kind === 'claim').at(-1);
    const conflicts = open().filter((o) => {
      if (o === it) return false;
      const live = is(o, 'task:status:running-executor') || is(o, 'task:status:running-agent');
      if (!live) return false;
      if (o.title === it.title) return true; // twin
      if (isStanding(it)) {
        const ups = registry.get(it.taskId)?.schedule_after ?? [];
        if (ups.some((up) => o.title === titleOf(up) && isStanding(o))) return true;
      }
      return false;
    });
    const earlier = conflicts.some((o) =>
      o.comments.filter((c) => c.kind === 'claim').at(-1)?.seq < myClaim.seq);
    if (!earlier) return true;
    endEpisode(it);
    setStatus(it, 'task:status:waiting-for-executor');
    record('claim-reverted', { task: it.taskId, issue: it.number, exec: execId });
    return false;
  }

  // One executor RUN — a workflow run in the real deployment — drains the
  // queue until nothing is pickable (#1212, the owner reversing §15.22's
  // one-item runs: Actions bills each job's minutes rounded UP, so a day's
  // cost is the RUN count, and a run that performs one item pays a whole
  // invocation — checkout, setup, rounding — per item). The run claims an
  // item, sees it through to its settle (close, hand-off, park), then picks
  // the next in the SAME run, ending only when nothing is pickable. The work
  // stays serial — the occupancy model is unchanged, only the run boundary
  // moved — and a run that dies still hands its remainder to the
  // failure-continuation job. Between items the run re-reads the operator
  // hold (an API read — the env copy is delivered at start only), so
  // suspension still parks the train at most one item later. Every run
  // records its trigger — scheduler-run-drain | label-event | close-drain |
  // failure-redispatch — so tests assert WHAT caused each run, and its
  // run-end carries `settled`, the count of items it converged.
  let runSeq = 0;
  function executorRun(execId = 'E1', trigger = 'label-event') {
    if (suspendedAll) { record('suspended-skip', { workflow: 'executor', trigger }); return; }
    const runId = `R${++runSeq}`;
    record('executor-run', { run: runId, exec: execId, trigger });
    let settled = 0;
    const step = () => { // claim attempts until one item is held; each settle loops back here
      if (suspendedAll) { // the between-items hold check: current work finished, nothing new starts
        record('suspended-skip', { workflow: 'executor', trigger, midRun: true });
        record('run-end', { run: runId, exec: execId, trigger, settled });
        return;
      }
      const it = pickable()[0];
      if (!it) { record('run-end', { run: runId, exec: execId, trigger, settled }); return; }
      if (!claim(it, execId, new Set(it.labels))) return step(); // loser tries another item
      if (!postClaimVerify(it, execId)) return step();
      const task = registry.get(it.taskId);
      if (!task) { close(it, 'rejected', { dispatchDrain: false }); settled++; return step(); } // validate: task gone (S20)
      record('pick', { run: runId, exec: execId, task: it.taskId, issue: it.number });
      executeClaimed(it, task, () => { settled++; step(); });
    };
    step();
  }

  // ---- the janitor (DESIGN §11): the judgment-and-long-horizon sweeps -------
  function janitor() {
    if (suspendedAll) { record('suspended-skip', { workflow: 'janitor' }); return; }
    // rule A — stale-ready: an item no executor picked for ~2 periods comes
    // out of the queue as a human's problem (S18's stuck member). The period is
    // the task's own cadence term at HEAD; a day for a task keeping none.
    for (const it of open().filter((i) => is(i, 'task:status:waiting-for-executor') && !i.escalated)) {
      const per = taskPeriodMs(registry.get(it.taskId)?.preconditions) ?? DAY;
      if (it.readySince !== null && now - it.readySince >= staleReadyPeriods * per) {
        it.escalated = true;
        park(it, 'task:status:waiting-for-executor', 'action'); // the lane is not draining; the fix is outside the item
        record('escalate', { task: it.taskId, issue: it.number, rule: 'stale-ready' });
      }
    }
    // rule B — the agent leash: task:status:running-agent silent past ~3h means the session
    // died; converge needs-human, naming the dead session (S11)
    for (const it of open().filter((i) => is(i, 'task:status:running-agent'))) {
      if (now - it.lastActivity >= agentLeashMs) {
        const dead = it.sessions.at(-1)?.id ?? 'unknown';
        // what the dead session left behind decides whether this re-queues
        park(it, 'task:status:running-agent', 'decision');
        it.comments.push({ t: now, body: `agent session ${dead} went silent past the leash` });
        record('agent-reclaim', { task: it.taskId, issue: it.number, session: dead });
      }
    }
    // rule C — stuck dependency (F14): a blocked item whose blockers have not
    // resolved for ~2 days is surfaced with an escalation COMMENT — labels
    // stay untouched, so the item still proceeds by itself the moment its
    // blockers resolve. Sleeping items (future Not-before, blockers closed)
    // never match.
    for (const it of open().filter((i) => is(i, 'task:status:blocked') && !i.escalated)) {
      const blocked = it.blockedBy.some((n) => issues.find((x) => x.number === n)?.state !== 'closed');
      if (blocked && now - it.createdAt >= staleBlockedMs) {
        it.escalated = true;
        it.comments.push({ t: now, body: 'stuck: blockers unresolved past the bound' });
        record('escalate', { task: it.taskId, issue: it.number, rule: 'stuck-dependency' });
      }
    }
  }

  // ---- the scenario DSL -----------------------------------------------------
  const droppedSchedulerRuns = [];
  const IN_FLIGHT = ['task:status:waiting-for-executor', 'task:status:running-executor', 'task:status:running-agent'];
  const sim = {
    issues, log, world, requests,
    requestItems: () => issues.filter((i) => i.request != null),
    requestIssue: (n) => requestOf(n),
    // The declaration as loaded — what passed the door (S70).
    task: (id) => registry.get(id),

    // ---- Action-executions accounting (#1212) ------------------------------
    // Every workflow RUN is a billed Actions invocation — each of its jobs'
    // minutes rounded UP — so a day's cost is the run count, not the work
    // done. Counts the two workflows the queue starts: the hourly scheduler
    // workflow and the executor workflow, the latter by trigger. A suspended
    // START still counts — the run starts, reads the hold and exits, and the
    // platform bills it — where the between-items hold stop (`midRun`)
    // happens inside a run already counted. The janitor is an ordinary daily
    // task (§11), not a workflow: its rules spend no invocation of their own.
    actionExecutions() {
      let scheduler = 0;
      const executorByTrigger = {};
      for (const e of log) {
        if (e.kind === 'scheduler-run'
          || (e.kind === 'suspended-skip' && e.workflow === 'scheduler-run')) scheduler++;
        else if (e.kind === 'executor-run'
          || (e.kind === 'suspended-skip' && e.workflow === 'executor' && !e.midRun)) {
          executorByTrigger[e.trigger] = (executorByTrigger[e.trigger] ?? 0) + 1;
        }
      }
      const executor = Object.values(executorByTrigger).reduce((a, b) => a + b, 0);
      return { scheduler, executor, executorByTrigger, total: scheduler + executor };
    },

    // A person marks an ordinary issue (DESIGN §16.1). `author` is the issue
    // author's login — the precondition judges its repo permission — and `model`
    // the optional family label. No latency sugar: adoption is the scheduler run's job,
    // so a mark waits for the next one.
    markIssue({ author = 'owner', model = null, comments = [] } = {}) {
      const req = {
        number: requests.length + 500,
        labels: new Set([ORIGIN_AD_HOC]),
        state: 'open', author, model, comments: [...comments],
      };
      requests.push(req);
      record('mark', { issue: req.number, author, model });
      return req;
    },
    // A person withdraws a request after it was adopted, or closes the issue.
    withdrawRequest(number) { requestOf(number).labels.delete(ORIGIN_AD_HOC); return sim; },
    closeRequestIssue(number) {
      const req = requestOf(number); req.state = 'closed';
      const it = issues.find((i) => i.request === number && i.state === 'open');
      if (it) { it.state = 'closed'; it.closedAt = now; } // one issue: closing it closes the item
      return sim;
    },
    // The issue stops existing (a 404): reads answer "not there", writes reach
    // nothing. Distinct from unreadable below — gone is a fact, not a fault.
    deleteRequestIssue(number) {
      const req = requestOf(number); req.state = 'gone';
      const it = issues.find((i) => i.request === number && i.state === 'open');
      if (it) it.state = 'gone';
      return sim;
    },
    // A transient API failure: the issue exists but cannot be read right now.
    setRequestUnreadable(number, on = true) { requestOf(number).unreadable = on; return sim; },
    // The phone-sized re-ask: clear the status, leaving the bare mark — the
    // next scheduler run re-adopts the same record. One lever for park,
    // rejection and review alike.
    remarkIssue(number, { model = null } = {}) {
      const req = requestOf(number);
      const st = statusOf(req);
      const settled = st === null || st.startsWith(NH('')) || st === 'task:status:rejected' || st === 'task:status:done';
      // While the run is LIVE there is nothing to ask again — the mark already
      // stands and the status says a run owns it, so an impatient re-ask
      // changes nothing (the one-issue mirror of "the mark waits, unconsumed").
      if (!settled) { record('mark', { issue: number, remark: true, refused: 'live' }); return req; }
      if (st !== null) clearStatus(req);
      req.labels.add(ORIGIN_AD_HOC);
      if (model) req.model = model;
      record('mark', { issue: number, remark: true });
      return req;
    },
    family, standingItem,

    // "at time X, Y happens"
    at(isoTime, fn) { schedule(T(isoTime), () => fn(sim)); return sim; },

    // GitHub drops scheduled fires in [from, to) — the scheduler runs simply don't run
    dropSchedulerRuns(fromIso, toIso) { droppedSchedulerRuns.push([T(fromIso), T(toIso)]); return sim; },
    // one late/manual scheduler run outside the cron grid (its drain job
    // dispatches only if the run leaves something pickable, like every other)
    schedulerRunAt(isoTime) {
      schedule(T(isoTime), schedulerRun);
      return sim;
    },

    // an established repo: every scheduled task already ran its previous
    // occurrence (a closed done item) — at its cadence's most recent anchor, a
    // `last-run-over:` duration ago, or a day ago for a task keeping no cadence
    seedSteadyState(asOfIso) {
      const t0 = T(asOfIso);
      for (const task of registry.values()) {
        if (!isScheduled(task.preconditions)) continue;
        const cadence = cadenceOf(task.preconditions);
        const a = cadence?.kind === 'due' ? mostRecentAnchor(cadence.cadence, t0)
          : cadence?.kind === 'elapsed' ? t0 - cadence.ms
            : t0 - DAY;
        issues.push({
          number: issues.length + 800, title: titleOf(task.id), taskId: task.id, qualifier: null,
          labels: new Set(), state: 'closed',
          createdAt: a, closedAt: a + 30 * MIN, readySince: null, lastActivity: a,
          notBefore: null, blockedBy: [], woken: null, outcome: 'done', comments: [],
          escalated: false, seeded: true,
        });
      }
      return sim;
    },

    // forcing a scheduled task = waking its standing item where one exists,
    // MINTING one where none does (DESIGN §8) — the common case once a decline
    // files nothing: for most of a quiet task's day there is no item to wake.
    // Either way the item is stamped `Woken`, which is what lets the cadence
    // terms hold at pick; an item already in flight is left alone (`already`),
    // and an id no declared task owns wakes nothing (`unmatched`) — planWake's
    // three answers. A task OFF THE SCHEDULE is never minted — a bare item of it
    // carries nothing its worker can read: the engine wakes the open items
    // routed to it, stamped `Woken`, and reports nothing where there are none
    // (#1721).
    force(taskId, { urgent = true } = {}) {
      const task = registry.get(taskId);
      if (!task) { record('force', { task: taskId, issue: null, unmatched: true }); return null; }
      if (!isScheduled(task.preconditions)) {
        const routed = issues.filter((i) => i.taskId === taskId && i.state === 'open'
          && !IN_FLIGHT.some((l) => is(i, l)));
        for (const i of routed) {
          i.notBefore = null;
          i.woken = now;
          if (is(i, 'task:status:blocked')) setStatus(i, READY);
          if (isParked(i)) { setStatus(i, READY); endEpisode(i); }
          record('force', { task: taskId, issue: i.number });
        }
        if (!routed.length) record('force', { task: taskId, issue: null, nothing: true });
        else schedule(now + 1 * MIN, () => executorRun('E1', 'label-event'));
        return routed[0] ?? null;
      }
      let it = standingItem(taskId);
      if (!it) {
        it = createIssue({ taskId, labels: ['task:status:waiting-for-executor'], urgent, woken: now });
        record('force', { task: taskId, issue: it.number, minted: true });
        schedule(now + 1 * MIN, () => executorRun('E1', 'label-event'));
        return it;
      }
      if (IN_FLIGHT.some((l) => is(it, l))) { record('force', { task: taskId, issue: it.number, already: true }); return it; }
      it.notBefore = null;
      it.woken = now;
      if (is(it, 'task:status:blocked')) setStatus(it, READY);
      // The hand-wake writes its own episode-marker comment (create-work-item),
      // unlike the bare human re-queue — so forcing ends the episode itself.
      if (isParked(it)) { setStatus(it, READY); endEpisode(it); }
      if (urgent) it.labels.add('task:urgent');
      record('force', { task: taskId, issue: it.number });
      schedule(now + 1 * MIN, () => executorRun('E1', 'label-event')); // the labeled event's latency sugar
      return it;
    },

    // ad-hoc work is creating an item (DESIGN §8). Deliberate concurrency for a
    // scheduled task names a qualifier (DESIGN §3): an UNQUALIFIED item of a
    // scheduled task is structurally its standing item, so creating one where
    // none is open is minting, and beside an open one it is a duplicate the
    // scheduler run's self-heal closes. Such an item is what a write-gated
    // human makes through the issue UI: planned, and NOT stamped `Woken` — the
    // engine's create lever refuses that shape, so nothing stamps it, and at
    // pick the cadence terms judge it over the task's other runs. A qualified
    // item, or one of a task off the schedule, is ad-hoc and woken by
    // construction — and an empty expression holds at its pick regardless.
    // eventLost models a dropped `labeled` webhook (S16): no immediate
    // executor run fires; the next scheduler run's drain is the guarantee.
    createItem(taskId, { urgent = false, notBefore = null, blockedBy = [], qualifier = null, eventLost = false } = {}) {
      const born = notBefore !== null || blockedBy.length ? 'task:status:blocked' : 'task:status:waiting-for-executor';
      const adHoc = qualifier !== null || !isScheduled(registry.get(taskId)?.preconditions);
      const it = createIssue({ taskId, labels: [born], notBefore, blockedBy, urgent, qualifier,
        origin: adHoc ? ORIGIN_AD_HOC : ORIGIN_PLANNED });
      if (born === 'task:status:waiting-for-executor' && !eventLost) schedule(now + 1 * MIN, () => executorRun('E1', 'label-event'));
      return it;
    },

    crashNextExecutionOf(taskId) { crashNextOf.add(taskId); return sim; },
    // the runner dies `minutes` INTO the work step: heartbeats until then, none
    // after, completion never runs — the leash-from-last-heartbeat recovery
    crashDuringWorkOf(taskId, minutes) { crashDuringWorkOf.set(taskId, minutes); return sim; },
    crashNextAgentOf(taskId) { crashAgentOf.add(taskId); return sim; },

    // the task file disappears from HEAD (S20): validate-in-code closes rejected
    removeTask(taskId) { registry.delete(taskId); return sim; },

    // a declaration change lands at HEAD (S28): the very next scheduler run/pick reads
    // the new preconditions/after — items carry no schedule to migrate
    updateTask(taskId, patch) {
      registry.set(taskId, loadDeclaration({ ...registry.get(taskId), ...patch }));
      return sim;
    },

    // an open work item left by a FIELDED engine (S62): the old vocabulary on
    // the wire, exactly as stored — the decode must react to it as to its own,
    // and the first transition the engine writes comes out canonical
    legacyIssue(taskId, labels, { qualifier = null } = {}) {
      const it = {
        number: issues.length + 600,
        title: titleOf(taskId) + (qualifier ? ` ${qualifier}` : ''),
        taskId, qualifier, labels: new Set(labels), state: 'open',
        createdAt: now, closedAt: null,
        readySince: labels.includes('task:ready') ? now : null, lastActivity: now,
        notBefore: null, blockedBy: [], woken: null, outcome: null, comments: [],
        escalated: false, sessions: [], quarantined: false,
      };
      issues.push(it);
      record('create', { task: taskId, issue: it.number, legacy: true });
      return it;
    },

    // an issue from another mechanism/vocabulary (S29): present in the repo,
    // outside the [claudinite-work] family — the scheduler run must never touch it
    foreignIssue(title) {
      const it = {
        number: issues.length + 700, title, taskId: null, qualifier: null,
        labels: new Set(['agent-dispatch']), state: 'open',
        createdAt: now, closedAt: null, readySince: null, lastActivity: now,
        notBefore: null, blockedBy: [], woken: null, outcome: null, comments: [],
        escalated: false, sessions: [],
        quarantined: false,
      };
      issues.push(it);
      return it;
    },

    // ---- multi-executor contention (S7) ------------------------------------
    // Two executors read the SAME snapshot of the ready list, so both pick
    // the same first item; both swap and post claim comments; the earliest
    // comment wins and the loser moves on to the next item read from LIVE
    // state — the verified lease, stale-read and all (DESIGN §6.2).
    // spread: false (default) — both executors pick the SAME first item (S7's
    // one-item race). spread: true — executor i picks snapshot[i]: different
    // items, claimed simultaneously from the same stale read, which is how a
    // twin pair or an upstream+dependent slip past the pick filters together
    // (S32/F15) — only the post-claim re-verify serializes them.
    raceExecutorsAt(isoTime, execIds, { spread = false } = {}) {
      schedule(T(isoTime), () => {
        const snapshot = pickable();
        const preReads = new Map(snapshot.map((i) => [i, new Set(i.labels)]));
        const winners = [];
        execIds.forEach((execId, k) => {
          const target = spread ? snapshot[k] : snapshot[0];
          if (!target) return;
          if (claim(target, execId, preReads.get(target))) winners.push([target, execId]);
          else executorRun(execId); // same-item loser moves on, from live state
        });
        for (const [target, execId] of winners) {
          if (!postClaimVerify(target, execId)) continue;
          const task = registry.get(target.taskId);
          if (task) executeClaimed(target, task);
        }
      });
      return sim;
    },

    // F16's precondition: a scheduler run whose issue list was stale created a second
    // standing item. Injected directly — the sim's own scheduler run can't produce it.
    injectDuplicateStanding(taskId) {
      return createIssue({ taskId, labels: ['task:status:waiting-for-executor'] });
    },

    // ---- the scheduler's fail-open levers ----------------------------------
    // The scheduler run cannot collect this task's signals (a missing
    // credential): its ask fails OPEN — the item is created and the executor,
    // which holds the credentials, decides at pick. Only on ticks where the
    // run-history terms did not already decline: those need no signal.
    setSignalsUnavailable(taskId, on = true) {
      if (on) signalsUnavailable.add(taskId); else signalsUnavailable.delete(taskId);
      return sim;
    },
    // The next work-item POST for this task is refused (F31's write failure).
    failNextCreateOf(taskId) { failNextCreateOf.add(taskId); return sim; },

    // ---- platform failure injection (S9/S10) -------------------------------
    // refused: the endpoint answers with an error status — no session exists
    apiRefusedUntil(isoTime) { world._apiRefusedUntil = T(isoTime); return sim; },
    // unanswered: timeout/dropped connection — `started` says whether the call
    // actually created a session on the far side (the executor cannot know)
    apiUnansweredOnce({ started }) { world._apiUnanswered = { started }; return sim; },

    // ---- fleet / human levers ----------------------------------------------
    quarantine(number) { issues.find((i) => i.number === number).quarantined = true; return sim; },
    closeByHand(number, outcome = 'rejected') {
      const it = issues.find((i) => i.number === number);
      it.state = 'closed'; it.closedAt = now; it.outcome = outcome;
      for (const l of [...it.labels]) if (l.startsWith('task:') || l === 'needs-human') it.labels.delete(l);
      record('close', { task: it.taskId, issue: it.number, outcome, by: 'hand' });
      return sim;
    },
    // the operator hold (DESIGN §8): set/clear the suspend-all variable. Resume
    // needs no dispatch of its own — the next cron scheduler run self-heals — but the
    // impatient path is a hand-dispatched scheduler run (schedulerRunAt models it).
    suspendAll() { suspendedAll = true; record('suspend', {}); return sim; },
    resumeAll() { suspendedAll = false; record('resume', {}); return sim; },

    // the sanctioned human re-queue (F7, DESIGN §4): strip needs-human,
    // apply task:status:waiting-for-executor. A label edit and nothing else —
    // it stamps no `Woken`, so at pick the cadence terms judge the item over
    // the task's other runs, unlike the force lever above.
    requeue(number) {
      const it = issues.find((i) => i.number === number);
      unpark(it);
      it.labels.delete('task:status:blocked');
      it.notBefore = null;
      it.labels.add('task:status:waiting-for-executor');
      it.readySince = now;
      it.lastActivity = now;
      record('requeue', { task: it.taskId, issue: it.number });
      schedule(now + 1 * MIN, () => executorRun('E1', 'label-event'));
      return sim;
    },

    // run the clock: scheduler runs at :schedulerRunMinute on each of `cronHours`
    // — every hour when it is null (each
    // dispatching its drain only when it leaves something pickable), a daily
    // janitor, then drain the event queue strictly in order
    run(fromIso, toIso) {
      const from = T(fromIso), to = T(toIso);
      for (let t = Math.ceil(from / HOUR) * HOUR + schedulerRunMinute * MIN; t < to; t += HOUR) {
        if (t < from) continue;
        if (cronHours && !cronHours.includes(new Date(t).getUTCHours())) continue;
        if (droppedSchedulerRuns.some(([a, b]) => t >= a && t < b)) continue;
        schedule(t, schedulerRun);
      }
      for (let t = Math.ceil(from / DAY) * DAY + 4 * HOUR + 3 * MIN; t < to; t += DAY) {
        if (t >= from) schedule(t, janitor);
      }
      for (;;) {
        queue.sort((a, b) => a.t - b.t || a.seq - b.seq);
        // Peek before shifting: an event beyond `to` must SURVIVE for a later
        // run() segment — a scenario may run in phases to assert a mid-state.
        if (!queue.length || queue[0].t >= to) break;
        const ev = queue.shift();
        now = ev.t;
        ev.fn();
      }
      now = to;
      return sim;
    },
  };
  return sim;
}
