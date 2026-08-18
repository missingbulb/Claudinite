// The fleet overview: every member at once, worst first, with a way into any one of
// them. `fleet.mjs` decides what the rows MEAN; this file fetches and draws them.

import * as gh from './github.mjs';
import {
  summariseMember, rankMembers, rollUp, packSpread, taskSpread,
} from './fleet.mjs';
import {
  $, el, ago, duration, head, emptyRow, repoLink, tiles, segmentBar,
  reasonNodes, LEVEL_GLYPH, STATE_ORDER, STATE_COLOR, STATE_UI, OUTCOME_COLOR,
} from './ui.mjs';
import { OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE } from '../../engine/scheduler/queue/work-item.mjs';

// Members are read concurrently, but not all at once: a dozen members at six calls
// each is enough parallel load to trip secondary rate limiting, and the page is not
// in a hurry. Small and steady beats a burst that gets throttled.
const CONCURRENCY = 4;

async function pool(items, worker, limit = CONCURRENCY) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

// One member's raw reads. Everything is wrapped: a member that 404s, times out or is
// rate-limited becomes a row that SAYS SO, because one unreadable repo must not blank
// the other eleven.
async function readMember(repo, token, { withTree = true } = {}) {
  try {
    const meta = await gh.getRepo(repo, token);
    const sha = await gh.getHeadSha(repo, meta.default_branch, token);
    const configText = await gh.getTextAtSha(repo, sha, '.claudinite-checks.json', token);

    let declaration = null;
    if (configText) {
      try { declaration = JSON.parse(configText); } catch { declaration = null; }
    }

    // A member that does not run Claudinite needs no further reads — and skipping
    // them is most of the saving on a fleet where not everything is adopted.
    if (!declaration) return { repo, declaration: null, defaultBranch: meta.default_branch };

    const [tree, issuePage, runs] = await Promise.all([
      withTree ? gh.listTreeAtSha(repo, sha, token).catch(() => null) : Promise.resolve(null),
      // One page is the whole live queue plus recent history, which is all a fleet row
      // needs. Deep history is the per-repo view's job.
      gh.listIssues(repo, token, { pages: 1 }).catch(() => ({ issues: [] })),
      gh.listRuns(repo, token, 30).catch(() => []),
    ]);

    return {
      repo,
      declaration,
      defaultBranch: meta.default_branch,
      sha,
      paths: tree?.paths ?? null,
      items: issuePage.issues,
      runs,
    };
  } catch (error) {
    return { repo, error };
  }
}

// The canon reference the mount column compares against. Optional by design: with no
// `canonRepo` configured the column reads `unknown` rather than inventing `current`,
// and no repo name is ever hardcoded in engine code.
async function readCanon(config, token) {
  if (!config?.canonRepo) return null;
  try {
    const meta = await gh.getRepo(config.canonRepo, token);
    const ref = await gh.getHeadSha(config.canonRepo, meta.default_branch, token);
    const text = await gh.getTextAtSha(config.canonRepo, ref, '.claudinite-checks.json', token);
    let engineVersion = null;
    try { engineVersion = JSON.parse(text ?? '{}')?.claudinite?.engineVersion ?? null; } catch { /* absent */ }
    return { repo: config.canonRepo, ref, engineVersion };
  } catch {
    return null;
  }
}

// --- render ---------------------------------------------------------------------

const MOUNT_UI = {
  current: { label: 'current', cls: 'ok' },
  behind: { label: 'behind', cls: 'info' },
  'behind-engine': { label: 'old engine', cls: 'serious' },
  stalled: { label: 'stalled', cls: 'warning' },
  none: { label: 'no stamp', cls: 'warning' },
  unknown: { label: '—', cls: 'idle' },
};

function memberRow(s, onOpen, now) {
  const open = (e) => { e.preventDefault(); onOpen(s.repo); };

  const name = el('td', {}, [
    el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, className: 'name', textContent: s.repo.split('/')[1] ?? s.repo, onclick: open }),
    el('div', { className: 'sub' }, [repoLink(s.repo)]),
  ]);

  if (s.status !== 'adopted') {
    return el('tr', { className: `lvl-${s.level} muted-row` }, [
      name,
      el('td', { colSpan: 5 }, reasonNodes(s.reasons)),
      el('td', { className: 'nw' }, [el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, textContent: 'open', onclick: open })]),
    ]);
  }

  // Health: the worst reason, spelled out. Never a bare colour.
  const health = el('td', {}, s.reasons.length
    ? reasonNodes(s.reasons)
    : [el('span', { className: 'warn ok', textContent: `${LEVEL_GLYPH.ok} healthy` })]);

  // Queue: the state mix as one thin bar plus the counts that are non-zero, so a
  // member with nothing open reads as empty rather than as a row of zeros.
  const counts = STATE_ORDER.filter((st) => s.open.byState[st] > 0)
    .map((st) => `${s.open.byState[st]} ${STATE_UI[st].label}`);
  const queue = el('td', {}, [
    segmentBar(STATE_ORDER.map((st) => [STATE_UI[st].label, s.open.byState[st], STATE_COLOR[st]]), { width: 92 }),
    el('div', { className: 'sub', textContent: counts.length ? counts.join(' · ') : 'nothing open' }),
  ]);

  const outcomeBar = segmentBar([
    ['done', s.outcomes[OUTCOME_DONE], OUTCOME_COLOR[OUTCOME_DONE]],
    ['delivered', s.outcomes[OUTCOME_DELIVERED], OUTCOME_COLOR[OUTCOME_DELIVERED]],
    ['obsolete', s.outcomes[OUTCOME_OBSOLETE], OUTCOME_COLOR[OUTCOME_OBSOLETE]],
    ['no outcome', s.outcomes.none, OUTCOME_COLOR.none],
  ], { width: 92 });

  const activity = el('td', {}, [
    outcomeBar,
    el('div', { className: 'sub', textContent: s.lastActivity ? ago(s.lastActivity, now) : (s.closedSeen ? 'unknown' : 'nothing closed yet') }),
  ]);

  const runs = el('td', { className: 'nw' }, [
    el('div', {
      className: s.runs.consecutiveFailures ? 'warn critical' : 'sub',
      textContent: s.runs.consecutiveFailures
        ? `${LEVEL_GLYPH.critical} ${s.runs.consecutiveFailures} failing`
        : (s.runs.everRan ? 'passing' : 'never run'),
    }),
    el('div', { className: 'sub', textContent: s.runs.lastAt ? ago(s.runs.lastAt, now) : '—' }),
  ]);

  const m = MOUNT_UI[s.mount.state] ?? MOUNT_UI.unknown;
  const mount = el('td', { className: 'nw' }, [
    el('div', { className: `warn ${m.cls}`, textContent: m.label }),
    el('div', { className: 'sub num', textContent: s.mount.ref ? s.mount.ref.slice(0, 7) : '—' }),
  ]);

  const tasks = el('td', { className: 'num nw' }, [
    el('div', { textContent: s.declaredTasks == null ? '—' : String(s.declaredTasks) }),
    el('div', { className: 'sub', textContent: `${s.packs.length} packs` }),
  ]);

  return el('tr', { className: `lvl-${s.level}` }, [name, health, queue, activity, runs, mount, tasks]);
}

// A member whose read has not landed yet. It is a row from the first paint rather
// than a gap that fills in, because a fleet page that appears all at once at the end
// looks broken for the whole sweep — and on a slow or throttled read, the sweep is
// most of the time the viewer spends here.
const pendingRow = (repo) => el('tr', { className: 'pending-row' }, [
  el('td', {}, [
    el('span', { className: 'name', textContent: repo.split('/')[1] ?? repo }),
    el('div', { className: 'sub' }, [repoLink(repo)]),
  ]),
  el('td', { colSpan: 6 }, [el('span', { className: 'sub', textContent: 'reading…' })]),
]);

function renderFleet(summaries, reads, now, onOpen, canon, progress = null) {
  const resolved = summaries.filter(Boolean);
  const pending = summaries.map((s, i) => (s ? null : reads.names?.[i])).filter(Boolean);
  const roll = rollUp(resolved);

  tiles($('fleet-tiles'), [
    [roll.needAttention, 'members need you', roll.needAttention ? 'var(--critical)' : null,
      roll.needAttention ? 'parked, failing, or past a leash' : 'nothing is on fire'],
    [roll.parkedItems, 'items parked', roll.parkedItems ? 'var(--critical)' : null,
      roll.parkedMembers ? `across ${roll.parkedMembers} member(s)` : ''],
    [roll.failingMembers, 'schedulers failing', roll.failingMembers ? 'var(--critical)' : null,
      roll.neverRan ? `${roll.neverRan} never ran` : ''],
    [roll.behindMembers, 'mounts behind', roll.behindMembers ? 'var(--serious)' : null,
      canon ? `canon ${canon.ref.slice(0, 7)}` : 'no canon configured'],
    [roll.openItems, 'open work items', null, `${roll.inFlight} run(s) in flight`],
    [`${roll.adopted}/${roll.members}`, 'members adopted', null,
      [roll.notAdopted ? `${roll.notAdopted} not adopted` : '', roll.unreadable ? `${roll.unreadable} unreadable` : ''].filter(Boolean).join(', ')],
  ]);

  // Every number above is a number about the members READ SO FAR, and a partial
  // rollup that does not say so is a wrong one. The count is stated rather than the
  // page waiting to be sure.
  $('fleet-progress').textContent = progress && progress.done < progress.total
    ? `${progress.done}/${progress.total} repos read — figures below cover those`
    : (progress ? `${progress.total} repos read` : '');

  const body = head($('fleet'), ['Member', 'Health', 'Queue', 'Recent outcomes', 'Scheduler', 'Mount', 'Tasks']);
  if (!summaries.length) { body.append(emptyRow(7, 'No members in the roster.')); return; }
  for (const s of rankMembers(resolved)) body.append(memberRow(s, onOpen, now));
  for (const repo of pending) body.append(pendingRow(repo));

  // Tasks across the fleet. This is the view a per-repo page structurally cannot
  // give: a shared pack's task parked in four members at once is a canon problem,
  // and in any single repo it looks like that repo's bad luck.
  const spread = taskSpread(reads.filter(Boolean), now).filter((t) => t.members > 0);
  const tbody = head($('fleet-tasks'), ['Task', 'Members', 'Open', 'Parked', 'Succeeded', 'No outcome']);
  if (!spread.length) tbody.append(emptyRow(6, 'No work items seen across the fleet.'));
  for (const t of spread.slice(0, 25)) {
    tbody.append(el('tr', { className: t.parked ? 'lvl-critical' : '' }, [
      el('td', {}, [
        el('div', { className: 'name', textContent: t.task }),
        el('div', { className: 'sub', textContent: t.pack }),
      ]),
      el('td', { className: 'num', textContent: String(t.members) }),
      el('td', { className: 'num', textContent: String(t.open) }),
      el('td', {}, t.parked
        ? [el('span', { className: 'warn critical', textContent: `${LEVEL_GLYPH.critical} ${t.parked}` })]
        : [el('span', { className: 'sub', textContent: '0' })]),
      el('td', { className: 'num', textContent: String(t.done) }),
      el('td', {}, t.failed
        ? [el('span', { className: 'warn serious', textContent: `${LEVEL_GLYPH.serious} ${t.failed}` })]
        : [el('span', { className: 'sub', textContent: '0' })]),
    ]));
  }

  const packs = packSpread(resolved);
  $('fleet-packs').replaceChildren(...packs.map((p) =>
    el('span', { className: 'chip', title: `${p.members} member(s)` }, [
      p.pack, el('b', { className: 'count', textContent: String(p.members) }),
    ])));
}

// --- entry ----------------------------------------------------------------------

export async function loadFleet({ repos, token, config, onOpen, onError, onProgress }) {
  gh.resetCounters();
  const now = Date.now();

  const canon = await readCanon(config, token);

  // Rendered on every arrival rather than once at the end: the page is useful from
  // the first member back, and the member a viewer opened it for may be the first.
  const reads = new Array(repos.length).fill(null);
  reads.names = repos;
  const summaries = new Array(repos.length).fill(null);
  let done = 0;
  const paint = () => renderFleet(summaries, reads, now, onOpen, canon, { done, total: repos.length });
  paint();

  await pool(repos, async (repo, i) => {
    const r = await readMember(repo, token);
    reads[i] = r;
    summaries[i] = summariseMember(r, { now, canon });
    done += 1;
    onProgress?.(done, repos.length, repo);
    paint();
    return r;
  });
  const failed = summaries.filter((s) => s?.status === 'unreadable');
  // Surfaced once at the top rather than as twelve separate errors: on a fleet, some
  // members being invisible to you is the normal case, not an incident.
  if (failed.length === repos.length && repos.length > 0) {
    onError?.(`None of the ${repos.length} members could be read — check that you are signed in with an account that can see them.`);
  }

  paint();
  return { summaries: summaries.filter(Boolean), now, canon };
}
