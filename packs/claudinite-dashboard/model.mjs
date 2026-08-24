// The dashboard's derivation layer — repo facts in, view rows out. Pure: it reads
// no clock, opens no socket, and touches no DOM, so the whole of what the page
// claims is testable in Node and shared verbatim with the browser.
//
// It states NONE of the queue's vocabulary itself. The label set, the title
// grammar, the leash constants and the anchor arithmetic are imported from the
// engine modules that define them, which is what makes a dashboard that cannot
// drift from the mechanism it renders: there is no second copy to drift.
//
// Those engine modules are pure ESM with no `node:` imports, which is the property
// this file depends on and `browser-graph.test.mjs` pins across the page's whole
// import graph. Living inside `packs/claudinite-tasks/` makes the queue modules siblings,
// so the dashboard sits beside the mechanism it renders rather than reaching across
// the tree at it.
//
// `stripComments` is the one remaining cross-tree reach, and it is deliberate:
// `file-placement` flags it advisory and its own remedy sanctions exactly this case.
// Shortening it would mean copying a comment-stripper nearer, and a second stripper
// that drifts from the canonical one is worse than the distance.

import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';
import { mostRecentAnchor, nextAnchor, periodMs } from '../claudinite-tasks/shared-code/anchors.mjs';
import {
  EXECUTING_LEASH_MS, AGENT_LEASH_MS, STALE_READY_PERIODS, STUCK_BLOCKED_MS,
} from '../claudinite-tasks/shared-code/work-items.mjs';
import {
  WORK_PREFIX, BLOCKED, READY, URGENT, EXECUTING, AGENT, NEEDS_HUMAN,
  outcomeOf as decodeOutcome,
  STATUS_BLOCKED, STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT,
  statusesOn, isParked, parkKindOf, triageLabelFor,
  NEEDS_HUMAN_ACTION, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_APPROVAL,
  NEEDS_HUMAN_FAILURE, isBlockingPark, parseLastVerdict,
  CLAIM_MARKER, HANDOFF_MARKER, EPISODE_MARKER,
  parseWorkItemTitle, parseWorkItemBody, taskIdFromPath, hasLabel, labelNames,
} from '../claudinite-tasks/shared-code/work-items.mjs';

export {
  WORK_PREFIX, BLOCKED, READY, URGENT, EXECUTING, AGENT, NEEDS_HUMAN,
  EXECUTING_LEASH_MS, AGENT_LEASH_MS, STUCK_BLOCKED_MS, STALE_READY_PERIODS,
  parseWorkItemTitle, nextAnchor, mostRecentAnchor, periodMs,
};

// How long a due item may sit blocked before the page calls the scheduler run out. The scheduler run
// is the repo's one cron, hourly; two fires of slack keeps a single late fire from
// reading as a fault. Not an engine constant because nothing engine-side measures
// this — the scheduler run readies due items on its next fire, whenever that is.
export const DUE_SLACK_MS = 2 * 3600e3;

const ms = (t) => (t == null ? null : new Date(t).getTime());

// --- where a declared pack's tasks live ---------------------------------------

// A pack contributes tasks only if the repo DECLARES it: presence on disk is not
// activation (core's rule), and the mount carries packs a repo never declared. So
// the roster is built from the declaration list, and a task directory belonging to
// an undeclared pack is skipped rather than rendered greyed-out.
//
// Two roots, because the same code reads the canon home and a member: the home
// runs from the repo root (`packs/<id>`), a member from the mount
// (`.claudinite/shared/packs/<id>`), and a local pack — declared `local/<name>` —
// from `.claudinite/local/packs/<name>` in both.
export function declaredPackDirs(config) {
  const dirs = new Map();
  for (const entry of config?.packs ?? []) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (!id) continue;
    if (id.startsWith('local/')) {
      const name = id.slice('local/'.length);
      dirs.set(id, [`.claudinite/local/packs/${name}`]);
    } else {
      dirs.set(id, [`packs/${id}`, `.claudinite/shared/packs/${id}`]);
    }
  }
  return dirs;
}

const TASK_PATH_RE = /^(.*)\/tasks\/([^/]+)\/task\.mjs$/;

// Every declared pack's task declarations, from one recursive tree listing.
// `paths` is the flat list of blob paths the tree API returned.
export function taskDeclarationPaths(paths, config) {
  const dirs = declaredPackDirs(config);
  const found = [];
  for (const path of paths ?? []) {
    const m = TASK_PATH_RE.exec(path);
    if (!m) continue;
    const [, packDir, task] = m;
    for (const [pack, roots] of dirs) {
      if (roots.includes(packDir)) found.push({ pack, task, path });
    }
  }
  return found.sort((a, b) => `${a.pack}/${a.task}`.localeCompare(`${b.pack}/${b.task}`));
}

// --- reading a task declaration -----------------------------------------------

// The declaration is a JS object literal, and the page reads it as TEXT: it renders
// other repos over the API, where there is nothing to import and no Node to import
// it with. So the scalar fields are lifted by pattern, over comment-stripped source
// — the engine's own `stripComments`, so a `// frequency: 'weekly'` in a task's
// header prose can never be mistaken for the declaration.
//
// A field this cannot read comes back NULL and renders as "unknown". It is never
// defaulted: a task whose declaration this misreads must look unreadable, because a
// plausible wrong frequency would silently move a next-anchor the whole roster is
// read for.
// The key must open the line or follow a `{` / `,` — anchoring on the line start
// alone would miss a declaration written on one line, and anchoring on nothing
// would let `code_work` be found inside `agent_code_work`. The value may close on a
// comma, the object's brace, or the line's end, so a last field without a trailing
// comma still reads.
const at = (field) => `(?:^|[{,])\\s*${field}:\\s*`;

const scalar = (src, field) => {
  const m = new RegExp(`${at(field)}(?:'([^']*)'|"([^"]*)"|(\\d+)|(true|false))\\s*(?=[,}\\n]|$)`, 'm').exec(src);
  if (!m) return null;
  if (m[3] !== undefined) return Number(m[3]);
  if (m[4] !== undefined) return m[4] === 'true';
  return m[1] ?? m[2];
};

const stringArray = (src, field) => {
  const m = new RegExp(`${at(field)}\\[([^\\]]*)\\]`, 'm').exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2]);
};

export function parseDeclaration(text) {
  const src = stripComments(String(text ?? ''));
  return {
    id: scalar(src, 'id'),
    frequency: scalar(src, 'frequency'),
    agent_model: scalar(src, 'agent_model'),
    expected_outcome: scalar(src, 'expected_outcome'),
    interrupt_policy: scalar(src, 'interrupt_policy'),
    code_work: scalar(src, 'code_work'),
    agent_execution_timeout: scalar(src, 'agent_execution_timeout'),
    precondition_signals: stringArray(src, 'precondition_signals'),
    // A task may decline to run; whether it CAN is the difference between "did not
    // run" being routine and being a fault, so the roster shows it.
    has_precondition: /^\s*(?:async\s+)?precondition\s*\(/m.test(src),
  };
}

// --- work items ----------------------------------------------------------------

// An item is a filed `[claudinite-work]` issue OR an adopted marked issue — the
// one-issue request model's other shape, which keeps the person's own title
// (tasks-dispatch DESIGN §16.1). One definition, shared with the queue's own reader.
export { isQueueItem as isWorkItem } from '../claudinite-tasks/shared-code/work-items.mjs';

// The page's five state keys, one per decoded status. The keys are the engine's
// own constants rather than the canonical spellings, because a page groups the four
// park kinds under one "needs human" column and routes by the kind separately
// (`triageOf`).
const STATE_KEY = new Map([
  [STATUS_BLOCKED, BLOCKED], [STATUS_READY, READY],
  [STATUS_RUNNING_EXECUTOR, EXECUTING], [STATUS_RUNNING_AGENT, AGENT],
]);

// The one state an open item is in, decoded from whatever spelling filed it, or
// `unlabelled` for an item wearing none — which is not a display quirk but the
// torn-label-swap leavings the janitor repairs, so it gets its own rendered state
// rather than being folded into "blocked".
export function stateOf(item) {
  if (item?.state === 'closed') return 'closed';
  if (isParked(item)) return NEEDS_HUMAN;
  const worn = statusesOn(item).filter((s) => STATE_KEY.has(s));
  if (worn.length === 1) return STATE_KEY.get(worn[0]);
  if (worn.length > 1) return 'torn';
  return 'unlabelled';
}

// What the park is asking for, or null for an item that is not parked. A park whose
// kind cannot be decoded — an older engine's bare one, a word a newer engine
// invented — reads as `failure`, the lane that says "someone diagnose this".
export const triageOf = (item) => (isParked(item) ? triageLabelFor(parkKindOf(item)) : null);

const TRIAGE_TEXT = {
  [NEEDS_HUMAN_APPROVAL]: 'a PR to approve',
  [NEEDS_HUMAN_ACTION]: 'something to change outside the code',
  [NEEDS_HUMAN_DECISION]: 'a decision to make',
  [NEEDS_HUMAN_FAILURE]: 'a break to diagnose, holding the task\'s lane',
};

// The outcome as its canonical word ('done' | 'delivered' | 'obsolete' | null) —
// the engine's decoder, which maps every legacy spelling straight to today's.
export const outcomeOf = decodeOutcome;

// How long the item has sat where it is. Every transition is a label write, so
// `updated_at` is the last touch — the same quantity the janitor's rules count.
const idleMs = (item, now) => ms(now) - (ms(item?.updated_at) ?? ms(item?.created_at) ?? ms(now));

// Warnings, each mirroring a real recovery rule rather than a display heuristic, so
// what the page flags is what the engine will actually act on — and how long the
// viewer waits for it.
//
// `isOpen(number)` answers whether a `Blocked-by` issue is still open — true, false,
// or null for one outside what the caller fetched. Unknown is never alarmed on.
export function warningsFor(item, now, { periodFor = () => null, isOpen = () => null } = {}) {
  const out = [];
  const state = stateOf(item);
  const idle = idleMs(item, now);
  if (state === EXECUTING && idle >= EXECUTING_LEASH_MS) {
    out.push({ level: 'serious', text: 'executing past the leash — the next scheduler run reclaims it' });
  }
  if (state === AGENT && idle >= AGENT_LEASH_MS) {
    out.push({ level: 'serious', text: 'agent claim past the leash — the janitor reclaims it' });
  }
  if (state === READY) {
    const per = periodFor(`${parseWorkItemTitle(item.title)?.pack}/${parseWorkItemTitle(item.title)?.task}`) ?? 86400e3;
    if (idle >= STALE_READY_PERIODS * per) out.push({ level: 'serious', text: 'ready but unpicked for ~2 periods' });
  }
  if (state === BLOCKED) {
    // The standing-item model: blocked is the queue's healthy quiet state, not a
    // fault. A rolled item waiting out its Not-before never warns; what does warn is
    // the two things the engine would actually act on — dependencies unresolved past
    // the janitor's threshold, and an item DUE that the scheduler run has failed to ready.
    const { notBefore, blockedBy } = parseWorkItemBody(item.body);
    const wake = ms(notBefore);
    const depStates = blockedBy.map((n) => isOpen(n));
    if (wake !== null && wake > ms(now)) {
      // waiting out its stamped wake — healthy, whatever its age
    } else if (depStates.some((s) => s === true)) {
      if (idle >= STUCK_BLOCKED_MS) {
        out.push({ level: 'warning', text: `blocked on ${blockedBy.map((n) => `#${n}`).join(', ')} for over 2 days — the janitor flags stuck dependencies` });
      }
    } else if (!depStates.some((s) => s === null)) {
      // Nothing blocks it any more: the next scheduler run readies it. Due only measures from
      // the stamped wake — with dependencies the closing time is not on this item,
      // and a guess would alarm on an item that became due minutes ago.
      if (wake !== null && ms(now) - wake >= DUE_SLACK_MS) {
        out.push({ level: 'serious', text: 'due but not readied — is the scheduler run running?' });
      } else if (wake === null && blockedBy.length === 0 && idle >= DUE_SLACK_MS) {
        out.push({ level: 'serious', text: 'due but not readied — is the scheduler run running?' });
      }
    }
  }
  if (state === NEEDS_HUMAN) {
    // What the park is asking for, and whether it is holding the task's lane —
    // an approval waiting on a reviewer is not the same alarm as a broken run
    // that has stopped its task being scheduled at all.
    const t = triageOf(item);
    out.push({
      level: isBlockingPark(item) ? 'critical' : 'warning',
      text: t ? `parked for a human — ${TRIAGE_TEXT[t]}` : 'parked for a human — unclassified, holding the task\'s lane',
    });
  }
  if (state === 'torn') out.push({ level: 'warning', text: 'wearing more than one state label' });
  if (state === 'unlabelled') out.push({ level: 'warning', text: 'open with no state label' });
  return out;
}

// An open item, decorated with everything the queue lane renders.
export function describeItem(item, now, opts = {}) {
  // A marked issue keeps the person's own title, so its task comes from the worker
  // path its machine block names — without that the page would render every request
  // run as an item belonging to no task at all.
  const parsed = parseWorkItemTitle(item.title)
    ?? (taskIdFromPath(parseWorkItemBody(item.body).taskPath) ? { ...taskIdFromPath(parseWorkItemBody(item.body).taskPath), qualifier: null } : null)
    ?? { pack: null, task: null, qualifier: null };
  const body = parseWorkItemBody(item.body);
  const state = stateOf(item);
  return {
    number: item.number,
    // The issue's own title, kept as GitHub has it: a surface that NAMES one item —
    // rather than counting them — has nothing else to call it by.
    title: item.title,
    key: parsed.pack && parsed.task ? `${parsed.pack}/${parsed.task}` : null,
    ...parsed,
    state,
    outcome: outcomeOf(item),
    triage: triageOf(item),
    blockingPark: state === NEEDS_HUMAN && isBlockingPark(item),
    urgent: hasLabel(item, URGENT),
    labels: labelNames(item),
    notBefore: body.notBefore,
    blockedBy: body.blockedBy,
    taskPath: body.taskPath,
    // The roll's record: when the last ask declined, why, and the stamped wake.
    lastVerdict: parseLastVerdict(item.body),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    closedAt: item.closed_at ?? null,
    idleMs: idleMs(item, now),
    comments: item.comments ?? 0,
    warnings: warningsFor(item, now, opts),
  };
}

// --- the roster ----------------------------------------------------------------

// One row per DECLARED task, whether or not it has ever run — a task that has never
// produced an item is exactly the interesting case, and an issue-derived list would
// omit it entirely.
export function buildRoster({ tasks = [], items = [], now, schedule, isOpen }) {
  const byKey = new Map();
  for (const it of items) {
    const p = parseWorkItemTitle(it.title);
    if (!p) continue;
    const key = `${p.pack}/${p.task}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
  }

  return tasks.map((t) => {
    const key = `${t.pack}/${t.task}`;
    const mine = (byKey.get(key) ?? []).slice()
      .sort((a, b) => ms(b.created_at) - ms(a.created_at));
    const open = mine.filter((i) => i.state === 'open');
    const closed = mine.filter((i) => i.state === 'closed');
    const freq = t.declaration?.frequency ?? null;

    // A frequency this could not read yields no anchor rather than a guessed one,
    // and `manual` genuinely has none — the two are different and render differently.
    let next = null;
    let anchorNote = null;
    if (freq === 'manual') anchorNote = 'manual — only a hand-created item';
    else if (!freq) anchorNote = 'frequency unknown';
    else if (!schedule) anchorNote = 'no schedule configured';
    else next = nextAnchor(freq, schedule, now);

    const current = open.length
      ? describeItem(open[0], now, { periodFor: () => (freq ? periodMs(freq) : null), isOpen })
      : null;

    return {
      key,
      pack: t.pack,
      task: t.task,
      path: t.path,
      declaration: t.declaration ?? null,
      frequency: freq,
      nextAnchor: next,
      anchorNote,
      periodMs: freq && freq !== 'manual' ? periodMs(freq) : null,
      current,
      nextAsk: nextAskOf(current, next, anchorNote),
      openCount: open.length,
      lastClosed: closed.length ? describeItem(closed[0], now) : null,
      history: closed.map((i) => describeItem(i, now)),
    };
  });
}

// What will actually happen to this task next, derived from the standing item where
// one exists — the calendar answers only when no item does (the next instantiation).
// This is where the standing-item model's facts become the roster's advice:
//   - the stamped Not-before IS the schedule (DESIGN §14, S28), so it wins over the
//     computed anchor;
//   - a blocking park stops the task being scheduled at all (§4) — showing an anchor
//     there would promise a run that will never be filed;
//   - a non-blocking park consumed its occurrence but leaves the lane open, so the
//     next anchor stands beside it.
function nextAskOf(current, anchor, anchorNote) {
  if (!current) return anchor ? { kind: 'anchor', at: anchor } : { kind: 'note', note: anchorNote };
  if (current.state === READY) return { kind: 'ready', urgent: current.urgent };
  if (current.state === EXECUTING || current.state === AGENT) {
    return { kind: 'running', phase: current.state === AGENT ? 'agent' : 'executor' };
  }
  if (current.state === NEEDS_HUMAN) {
    if (current.blockingPark) return { kind: 'held' };
    return anchor ? { kind: 'anchor', at: anchor } : { kind: 'note', note: anchorNote };
  }
  if (current.state === BLOCKED) {
    if (current.notBefore) return { kind: 'wake', at: new Date(current.notBefore) };
    return current.blockedBy.length ? { kind: 'deps', on: current.blockedBy } : { kind: 'ready-soon' };
  }
  // torn / unlabelled — off the state machine until the janitor repairs it.
  return { kind: 'off-machine' };
}

// Outcome tallies over the closed items the scan actually saw. `scanned` travels
// with them: every count here is over a window, and a window is not "all of it".
export function outcomeTally(rows) {
  const t = { done: 0, delivered: 0, obsolete: 0, none: 0 };
  for (const r of rows) for (const h of r.history) t[h.outcome ?? 'none'] += 1;
  return t;
}

// --- the protocol comments ------------------------------------------------------

// Which of the three markers a comment carries. The markers are HTML comments so a
// human reading the issue sees prose; the page shows the protocol beat instead.
export function commentKind(body) {
  const b = String(body ?? '');
  if (b.includes(EPISODE_MARKER)) return 'episode';
  if (b.includes(HANDOFF_MARKER)) return 'handoff';
  if (b.includes(CLAIM_MARKER)) return 'claim';
  return null;
}
