// The page: authenticate, fetch, render. Every derivation comes from `model.mjs`
// (pure, tested), every byte from `github.mjs` (the only I/O), every credential from
// `auth.mjs`. This file is the wiring between them and the DOM.

import * as gh from './github.mjs';
import * as auth from './auth.mjs';
import { loadConfig, loadRoster } from './config.mjs';
import { clearAll, stats } from './cache.mjs';
import {
  buildRoster, describeItem, isWorkItem, parseDeclaration, taskDeclarationPaths,
  periodMs, BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE,
} from './model.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};

let CONFIG = null;
let ROSTER = [];

// --- formatting ---------------------------------------------------------------

const DUR = [['d', 86400e3], ['h', 3600e3], ['m', 60e3]];
function duration(msVal) {
  if (msVal == null || !Number.isFinite(msVal)) return '—';
  const v = Math.abs(msVal);
  for (const [suffix, unit] of DUR) if (v >= unit) return `${Math.floor(v / unit)}${suffix}`;
  return '<1m';
}
const ago = (iso, now) => (iso ? `${duration(now - new Date(iso).getTime())} ago` : '—');
const until = (date, now) => (date ? `in ${duration(date.getTime() - now)}` : '—');
const stamp = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) : '—');

const STATE_UI = {
  [BLOCKED]:     { cls: 'blocked',   label: 'blocked' },
  [READY]:       { cls: 'ready',     label: 'ready' },
  [EXECUTING]:   { cls: 'executing', label: 'executing' },
  [AGENT]:       { cls: 'agent',     label: 'agent' },
  [NEEDS_HUMAN]: { cls: 'human',     label: 'needs human' },
  torn:          { cls: 'torn',      label: 'torn labels' },
  unlabelled:    { cls: 'torn',      label: 'no state label' },
  closed:        { cls: 'idle',      label: 'closed' },
};
const OUTCOME_COLOR = {
  [OUTCOME_DONE]: 'var(--good)',
  [OUTCOME_DELIVERED]: 'var(--s-violet)',
  [OUTCOME_OBSOLETE]: 'var(--muted)',
  none: 'var(--critical)',
};

function chip(state) {
  const ui = STATE_UI[state] ?? { cls: 'idle', label: state ?? 'idle' };
  return el('span', { className: `chip ${ui.cls}` }, [el('i', { className: 'dot' }), ui.label]);
}
const link = (repo, n) =>
  el('a', { href: `https://github.com/${repo}/issues/${n}`, target: '_blank', rel: 'noopener', textContent: `#${n}` });

function warnNodes(warnings) {
  // Icon plus words: a status color never carries the meaning by itself.
  const glyph = { critical: '●', serious: '▲', warning: '▲' };
  return warnings.map((w) => el('span', { className: `warn ${w.level}`, textContent: `${glyph[w.level] ?? '▲'} ${w.text}` }));
}

const head = (table, cols) => {
  table.append(el('thead', {}, [el('tr', {}, cols.map((c) => el('th', { textContent: c })))]));
  return table.appendChild(el('tbody'));
};
const emptyRow = (span, text) =>
  el('tr', {}, [el('td', { colSpan: span, className: 'empty', textContent: text })]);

// --- render -------------------------------------------------------------------

function renderTiles(rows, open, runs, now) {
  const inflight = runs.filter((r) => r.status === 'in_progress' || r.status === 'queued');
  const parked = open.filter((i) => i.state === NEEDS_HUMAN);
  const warned = open.filter((i) => i.warnings.length && i.state !== NEEDS_HUMAN);
  const soonest = rows.map((r) => r.nextAnchor).filter(Boolean).sort((a, b) => a - b)[0] ?? null;

  const tiles = [
    [rows.length, 'tasks declared'],
    [open.length, 'open work items'],
    [parked.length, 'parked for a human', parked.length ? 'var(--critical)' : null],
    [warned.length, 'past a leash', warned.length ? 'var(--serious)' : null],
    [inflight.length, 'runs in flight', inflight.length ? 'var(--s-yellow)' : null],
    [soonest ? until(soonest, now).replace('in ', '') : '—', 'to next anchor'],
  ];
  $('tiles').replaceChildren(...tiles.map(([v, k, color]) => el('div', { className: 'tile' }, [
    el('div', { className: 'v num', textContent: String(v), style: color ? `color:${color}` : '' }),
    el('div', { className: 'k', textContent: k }),
  ])));
}

function renderRoster(rows, repo, now, scanComplete) {
  const table = $('roster');
  table.replaceChildren();
  const body = head(table, ['Task', 'Cadence', 'Model', 'Ceiling', 'Now', 'Next anchor', 'Last outcome', 'History']);
  if (!rows.length) { body.append(emptyRow(8, 'No declared task has a tasks/ directory in this repo.')); return; }

  for (const r of rows.sort((a, b) => (a.nextAnchor?.getTime() ?? Infinity) - (b.nextAnchor?.getTime() ?? Infinity))) {
    const d = r.declaration ?? {};
    const tally = { [OUTCOME_DONE]: 0, [OUTCOME_DELIVERED]: 0, [OUTCOME_OBSOLETE]: 0, none: 0 };
    for (const h of r.history) tally[h.outcome ?? 'none'] += 1;

    const bar = el('div', { className: 'bar' });
    for (const [k, n] of Object.entries(tally)) {
      if (!n) continue;
      bar.append(el('i', { style: `flex:${n};background:${OUTCOME_COLOR[k]}`, title: `${n} ${k}` }));
    }

    const nowCell = r.current
      ? el('td', {}, [chip(r.current.state), ...warnNodes(r.current.warnings),
        el('div', { className: 'sub' }, [link(repo, r.current.number), ` · ${duration(r.current.idleMs)} idle`])])
      : el('td', {}, [el('span', { className: 'sub', textContent: 'no open item' })]);

    body.append(el('tr', {}, [
      el('td', {}, [
        el('div', { className: 'name', textContent: r.task }),
        el('div', { className: 'sub', textContent: r.pack }),
      ]),
      el('td', {}, [
        el('div', { className: 'nw', textContent: r.frequency ?? 'unknown' }),
        d.precondition_signals?.length
          ? el('div', { className: 'sub', textContent: d.precondition_signals.join(', ') })
          : el('div', { className: 'sub', textContent: d.has_precondition ? 'unconditional signals' : 'no precondition' }),
      ]),
      el('td', { className: 'nw', textContent: d.agent_model ?? '—' }),
      el('td', { className: 'nw', textContent: d.expected_outcome ?? '—' }),
      nowCell,
      el('td', { className: 'num' }, [
        el('div', { textContent: r.nextAnchor ? until(r.nextAnchor, now) : '—' }),
        el('div', { className: 'sub', textContent: r.nextAnchor ? stamp(r.nextAnchor.toISOString()) : (r.anchorNote ?? '') }),
      ]),
      el('td', {}, r.lastClosed
        ? [el('div', { textContent: (r.lastClosed.outcome ?? 'none').replace('outcome:', '') }),
          el('div', { className: 'sub', textContent: ago(r.lastClosed.closedAt, now) })]
        : [el('span', { className: 'sub', textContent: scanComplete ? 'never run' : 'none in window' })]),
      el('td', {}, [bar, el('div', { className: 'sub num', textContent: `${r.history.length} closed` })]),
    ]));
  }
}

function renderQueue(open, repo, now) {
  const table = $('queue');
  table.replaceChildren();
  const body = head(table, ['Item', 'Task', 'State', 'Waiting on', 'Idle', 'Comments']);
  if (!open.length) { body.append(emptyRow(6, 'The queue is empty — no open work item.')); return; }

  // Parked and warned first: the reason to open this panel is what is wrong.
  const rank = (i) => (i.state === NEEDS_HUMAN ? 0 : i.warnings.length ? 1 : 2);
  for (const i of open.sort((a, b) => rank(a) - rank(b) || b.idleMs - a.idleMs)) {
    const waiting = [];
    if (i.blockedBy.length) waiting.push(`blocked by ${i.blockedBy.map((n) => `#${n}`).join(', ')}`);
    if (i.notBefore) waiting.push(`not before ${stamp(i.notBefore)}`);

    body.append(el('tr', {}, [
      el('td', {}, [link(repo, i.number), i.urgent ? el('span', { className: 'chip urgent', textContent: 'urgent' }) : '']),
      el('td', {}, [
        el('div', { className: 'name', textContent: i.task ?? '(unparsed title)' }),
        el('div', { className: 'sub', textContent: i.pack ?? '' }),
      ]),
      el('td', {}, [chip(i.state), ...warnNodes(i.warnings)]),
      el('td', { className: 'sub', textContent: waiting.join(' · ') || '—' }),
      el('td', { className: 'num', textContent: duration(i.idleMs) }),
      el('td', { className: 'num', textContent: String(i.comments) }),
    ]));
  }
}

function renderRuns(runs, now) {
  const table = $('runs');
  table.replaceChildren();
  const body = head(table, ['Workflow', 'Status', 'Event', 'Branch', 'Started']);
  if (!runs.length) { body.append(emptyRow(5, 'No Actions runs visible.')); return; }

  const color = (r) => {
    if (r.status !== 'completed') return 'var(--s-yellow)';
    if (r.conclusion === 'success') return 'var(--good)';
    if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') return 'var(--muted)';
    return 'var(--critical)';
  };
  for (const r of runs.slice(0, 20)) {
    const label = r.status === 'completed' ? (r.conclusion ?? 'completed') : r.status.replace('_', ' ');
    body.append(el('tr', {}, [
      el('td', {}, [el('a', { href: r.html_url, target: '_blank', rel: 'noopener', textContent: r.name ?? '(workflow)' })]),
      // Icon + word, so a run's health never rests on the dot's color.
      el('td', {}, [el('span', { className: 'chip' }, [
        el('i', { className: 'dot', style: `background:${color(r)}` }), label,
      ])]),
      el('td', { className: 'sub', textContent: r.event ?? '—' }),
      el('td', { className: 'sub', textContent: r.head_branch ?? '—' }),
      el('td', { className: 'num sub', textContent: ago(r.created_at, now) }),
    ]));
  }
}

const showError = (msg) => $('errors').append(el('div', { className: 'err', textContent: msg }));

// --- auth surface ---------------------------------------------------------------

function renderAuth(viewer) {
  const box = $('auth');
  box.replaceChildren();
  const oauth = auth.isOAuthConfigured(CONFIG);

  if (viewer) {
    box.append(
      el('img', { className: 'avatar', src: viewer.avatar_url, alt: '', width: 22, height: 22 }),
      el('span', { className: 'hint', textContent: viewer.login }),
      el('button', { textContent: 'Sign out', onclick: () => { auth.signOut(); location.reload(); } }),
    );
    return;
  }
  if (oauth) {
    box.append(el('button', { className: 'primary', textContent: 'Sign in with GitHub', onclick: () => auth.beginSignIn(CONFIG) }));
    return;
  }
  // No OAuth configured — the paste fallback, which is also the local-dev path.
  const input = el('input', { id: 'token', type: 'password', placeholder: 'GitHub token', autocomplete: 'off' });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { auth.setPastedToken(input.value); load(); } });
  box.append(input, el('button', { textContent: 'Use token', onclick: () => { auth.setPastedToken(input.value); load(); } }));
}

function renderRepoPicker(current) {
  const sel = $('repo-picker');
  sel.replaceChildren();
  // Whatever the roster says, plus whatever the URL asked for — a repo not on the
  // roster is still viewable, so the roster is a convenience and never a gate.
  const names = [...new Set([...(current ? [current] : []), ...ROSTER])].sort();
  if (!names.length) { sel.hidden = true; return; }
  sel.hidden = false;
  for (const n of names) sel.append(el('option', { value: n, textContent: n, selected: n === current }));
}

// --- load ---------------------------------------------------------------------

const currentRepo = () =>
  new URL(location.href).searchParams.get('repo')
  || CONFIG?.defaultRepo
  || ROSTER[0]
  || '';

function setRepoInUrl(repo) {
  const url = new URL(location.href);
  url.searchParams.set('repo', repo);
  history.replaceState(null, '', url);
}

async function load() {
  const repo = currentRepo();
  const token = auth.currentToken();
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    $('footnote').textContent = '';
    showError('No repo selected. Add ?repo=owner/name, or configure a roster.');
    return;
  }
  setRepoInUrl(repo);

  $('errors').replaceChildren();
  $('footnote').textContent = 'Reading…';
  gh.resetCounters();

  let viewer = null;
  try {
    if (token) viewer = await gh.getViewer(repo, token);
  } catch (e) {
    if (e.status === 401) { auth.signOut(); showError('That credential is no longer valid — sign in again.'); }
  }
  renderAuth(viewer);
  renderRepoPicker(repo);

  try {
    const now = Date.now();
    const meta = await gh.getRepo(repo, token);
    const sha = await gh.getHeadSha(repo, meta.default_branch, token);

    const configText = await gh.getTextAtSha(repo, sha, '.claudinite-checks.json', token);
    if (!configText) showError(`${repo} has no .claudinite-checks.json — it does not run Claudinite, so there are no declared tasks.`);
    let declaration = null;
    try { declaration = configText ? JSON.parse(configText) : null; } catch {
      showError('.claudinite-checks.json is present but is not valid JSON — the roster will be empty.');
    }
    const schedule = declaration?.taskScheduler ?? null;
    if (declaration && !schedule) showError('No taskScheduler block — next-anchor times cannot be computed.');

    const [{ paths, truncated }, runs, issuePage] = await Promise.all([
      gh.listTreeAtSha(repo, sha, token),
      gh.listRuns(repo, token).catch((e) => { showError(`Actions unreadable — ${e.message}`); return []; }),
      gh.listIssues(repo, token),
    ]);
    if (truncated) showError('GitHub truncated the tree listing — some tasks may be missing from the roster.');

    const declPaths = declaration ? taskDeclarationPaths(paths, declaration) : [];
    const tasks = await Promise.all(declPaths.map(async (t) => ({
      ...t,
      declaration: parseDeclaration(await gh.getTextAtSha(repo, sha, t.path, token)),
    })));

    const items = issuePage.issues.filter(isWorkItem);
    const rows = buildRoster({ tasks, items, now, schedule });
    const periodFor = (k) => {
      const f = rows.find((r) => r.key === k)?.frequency;
      return f && f !== 'manual' ? periodMs(f) : null;
    };
    const open = items.filter((i) => i.state === 'open').map((i) => describeItem(i, now, { periodFor }));

    renderTiles(rows, open, runs, now);
    renderRoster(rows, repo, now, issuePage.complete);
    renderQueue(open, repo, now);
    renderRuns(runs, now);

    // What this cost, and what the window was. Both are things a viewer otherwise
    // has to guess: a cached history must not read as "never ran", and a fleet
    // sweep's rate-limit spend should be visible before it runs out.
    const c = stats();
    $('rate').textContent = Number.isFinite(gh.rate.remaining)
      ? `${gh.rate.remaining}/${gh.rate.limit} left · ${gh.rate.spent} spent, ${gh.rate.revalidated + gh.rate.served} cached`
      : '';
    $('footnote').textContent =
      `${repo} @ ${meta.default_branch} (${sha.slice(0, 7)}) · ${tasks.length} declared tasks · ${items.length} work items in the `
      + `${issuePage.complete ? `full issue history (${issuePage.scanned} issues)` : `most recent ${issuePage.scanned} issues — older history not scanned`}`
      + ` · this load: ${gh.rate.spent} API calls, ${gh.rate.revalidated} revalidated free, ${gh.rate.served} from cache`
      + ` · cache ${(c.bytes / 1024).toFixed(0)}KB in ${c.entries} entries`
      + ` · read ${new Date(now).toISOString().replace('T', ' ').slice(0, 16)}Z`;
    $('setup').open = false;
  } catch (e) {
    showError(e.message ?? String(e));
    if (e.status === 401 || e.status === 403) {
      showError(auth.isOAuthConfigured(CONFIG)
        ? 'Sign in with an account that can read this repo.'
        : 'That token cannot read this repo — it needs read-only Contents, Issues and Actions.');
    }
    $('footnote').textContent = '';
  }
}

// --- boot ---------------------------------------------------------------------

async function boot() {
  CONFIG = await loadConfig();

  // Handle an OAuth landing before anything reads the credential.
  const back = await auth.completeSignIn(CONFIG);
  if (back.status === 'error') showError(back.message);

  ROSTER = await loadRoster(CONFIG);
  renderAuth(null);
  renderRepoPicker(currentRepo());

  $('repo-picker').addEventListener('change', (e) => { setRepoInUrl(e.target.value); load(); });
  $('reload').addEventListener('click', load);
  $('purge').addEventListener('click', () => { clearAll(); load(); });
  $('theme').addEventListener('click', () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const cur = document.documentElement.dataset.theme || (dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  });

  // A signed-in viewer (or a still-valid session token) loads straight in; anyone
  // else sees the sign-in surface and the explainer, and nothing is fetched.
  if (auth.currentToken() || currentRepo()) load();
  else $('setup').open = true;
}

boot();
