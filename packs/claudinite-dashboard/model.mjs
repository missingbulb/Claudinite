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
// this file depends on and `model.test.mjs` pins. Living inside `engine/scheduler/`
// makes the queue modules siblings, so the dashboard sits beside the mechanism it
// renders rather than reaching across the tree at it.
//
// `stripComments` is the one remaining cross-tree reach, and it is deliberate:
// `file-placement` flags it advisory and its own remedy sanctions exactly this case.
// Shortening it would mean copying a comment-stripper nearer, and a second stripper
// that drifts from the canonical one is worse than the distance.

import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';
import { mostRecentAnchor, nextAnchor, periodMs } from '../../engine/scheduler/queue/anchors.mjs';
import {
  EXECUTING_LEASH_MS, AGENT_LEASH_MS, STALE_READY_PERIODS, STUCK_BLOCKED_MS,
} from '../../engine/scheduler/queue/leases.mjs';
import {
  WORK_PREFIX, BLOCKED, READY, URGENT, EXECUTING, AGENT, NEEDS_HUMAN,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE, STATE_LABELS,
  TRIAGE_LABELS, NEEDS_HUMAN_ACTION, NEEDS_HUMAN_DECISION, NEEDS_HUMAN_APPROVAL,
  NEEDS_HUMAN_FAILURE, isBlockingPark,
  CLAIM_MARKER, HANDOFF_MARKER, EPISODE_MARKER,
  parseWorkItemTitle, parseWorkItemBody, hasLabel, labelNames,
} from '../../engine/scheduler/queue/work-item.mjs';

export {
  WORK_PREFIX, BLOCKED, READY, URGENT, EXECUTING, AGENT, NEEDS_HUMAN,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE,
  EXECUTING_LEASH_MS, AGENT_LEASH_MS, STUCK_BLOCKED_MS, STALE_READY_PERIODS,
  parseWorkItemTitle, nextAnchor, mostRecentAnchor, periodMs,
};

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

export const isWorkItem = (issue) => String(issue?.title ?? '').startsWith(WORK_PREFIX);

// The one state label an open item wears, or null for an item wearing none — which
// is not a display quirk but the torn-label-swap leavings the janitor repairs, so
// it gets its own rendered state rather than being folded into "blocked".
export function stateOf(item) {
  if (item?.state === 'closed') return 'closed';
  if (hasLabel(item, NEEDS_HUMAN)) return NEEDS_HUMAN;
  const worn = STATE_LABELS.filter((l) => hasLabel(item, l));
  if (worn.length === 1) return worn[0];
  if (worn.length > 1) return 'torn';
  return 'unlabelled';
}

// The park's sub-label, or null for one wearing none (an older engine's, or an
// agent that skipped it). An item can only wear one meaningfully; first wins.
export const triageOf = (item) => TRIAGE_LABELS.find((l) => hasLabel(item, l)) ?? null;

const TRIAGE_TEXT = {
  [NEEDS_HUMAN_APPROVAL]: 'a PR to approve',
  [NEEDS_HUMAN_ACTION]: 'something to change outside the code',
  [NEEDS_HUMAN_DECISION]: 'a decision to make',
  [NEEDS_HUMAN_FAILURE]: 'a break to diagnose, holding the task\'s lane',
};

export function outcomeOf(item) {
  for (const o of [OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE]) if (hasLabel(item, o)) return o;
  return null;
}

// How long the item has sat where it is. Every transition is a label write, so
// `updated_at` is the last touch — the same quantity the janitor's rules count.
const idleMs = (item, now) => ms(now) - (ms(item?.updated_at) ?? ms(item?.created_at) ?? ms(now));

// Warnings, each mirroring a real recovery rule rather than a display heuristic, so
// what the page flags is what the engine will actually act on — and how long the
// viewer waits for it.
export function warningsFor(item, now, { periodFor = () => null } = {}) {
  const out = [];
  const state = stateOf(item);
  const idle = idleMs(item, now);
  if (state === EXECUTING && idle >= EXECUTING_LEASH_MS) {
    out.push({ level: 'serious', text: 'executing past the leash — the next tick reclaims it' });
  }
  if (state === AGENT && idle >= AGENT_LEASH_MS) {
    out.push({ level: 'serious', text: 'agent claim past the leash — the janitor reclaims it' });
  }
  if (state === READY) {
    const per = periodFor(`${parseWorkItemTitle(item.title)?.pack}/${parseWorkItemTitle(item.title)?.task}`) ?? 86400e3;
    if (idle >= STALE_READY_PERIODS * per) out.push({ level: 'serious', text: 'ready but unpicked for ~2 periods' });
  }
  if (state === BLOCKED && idle >= STUCK_BLOCKED_MS) {
    out.push({ level: 'warning', text: 'blocked for over 2 days' });
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
  const parsed = parseWorkItemTitle(item.title) ?? { pack: null, task: null, qualifier: null };
  const body = parseWorkItemBody(item.body);
  return {
    number: item.number,
    key: parsed.pack && parsed.task ? `${parsed.pack}/${parsed.task}` : null,
    ...parsed,
    state: stateOf(item),
    outcome: outcomeOf(item),
    urgent: hasLabel(item, URGENT),
    labels: labelNames(item),
    notBefore: body.notBefore,
    blockedBy: body.blockedBy,
    taskPath: body.taskPath,
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
export function buildRoster({ tasks = [], items = [], now, schedule }) {
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
      current: open.length ? describeItem(open[0], now, { periodFor: () => (freq ? periodMs(freq) : null) }) : null,
      openCount: open.length,
      lastClosed: closed.length ? describeItem(closed[0], now) : null,
      history: closed.map((i) => describeItem(i, now)),
    };
  });
}

// Outcome tallies over the closed items the scan actually saw. `scanned` travels
// with them: every count here is over a window, and a window is not "all of it".
export function outcomeTally(rows) {
  const t = { [OUTCOME_DONE]: 0, [OUTCOME_DELIVERED]: 0, [OUTCOME_OBSOLETE]: 0, none: 0 };
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
