// The fleet overview: every member at once, worst first, with a way into any one of
// them. `fleet.mjs` decides what the rows MEAN; this file fetches and draws them.

import * as gh from './github.mjs';
import {
  summariseMember, rankMembers, rollUp, packSpread, taskSpread, attentionBreakdown,
  memberAttention, fleetAttention, estimateMinutes, estimateNote, parkMinutes, parkMinutesNote,
} from './fleet.mjs';
import { readCanon, priceStampedPacks } from './canon.mjs';
import { activitySeries, fleetBenefits, delta, commitDays } from './activity.mjs';
import { readUsage } from './usage.mjs';
import {
  readContributions, liveSourcesNeeded, readDeploymentContributions, valueOf, fleetPhrase, phraseText,
} from './contributions.mjs';
import { miniCard, miniAbsent, packCard, CONTRIB_STATE_TEXT } from './contrib-view.mjs';
import { fleetGrowth } from './fleet-growth.mjs';
import { digestDates, digestDate, digestPath, digestEntry, MAX_DAYS_BACK } from './digest.mjs';
import { fleetCandidates } from './next-work.mjs';
import {
  $, el, ago, duration, groupedHead, columnCount, groupStarts, emptyRow, leadCard, repoLink, tiles, segmentBar,
  reasonNodes, stackedColumns, chartLegend, windowFigure, ciMark, commitGraph, packMark,
  LEVEL_GLYPH, STATE_ORDER, STATE_COLOR, STATE_UI, OUTCOME_COLOR,
} from './ui.mjs';
import { settingsTextAtSha } from './settings-read.mjs';
import { sweepPhases } from './fleet-sweep.mjs';

// --- the passes ------------------------------------------------------------------
//
// One member's reads, split into the passes `fleet-sweep.mjs` takes the whole roster
// through in turn. The split is by WHAT THE READ BUYS, worth-most first, because that
// is the order the viewer's rate limit is spent in:
//
//   identity      what this repo is and whether it runs Claudinite at all
//   attention     the queue and the scheduler — every reason a row is ever raised
//   depth         the tree and the member's own usage fold, behind those numbers
//   packs         what the member's own packs report about themselves
//   activity      the commit graph, which is decoration and says so
//
// Everything is wrapped: a member that 404s, times out or is rate-limited becomes a
// row that SAYS SO, because one unreadable repo must not blank the other eleven.

// Pass one. Three calls, and for a repo that does not run Claudinite they are the
// only three it ever costs — which is most of the saving on a fleet where not
// everything is adopted.
async function readIdentity(repo, token) {
  try {
    const meta = await gh.getRepo(repo, token);
    // The head commit, kept whole: its date is when this member last landed anything,
    // and it arrives in the call the content cache already makes for the sha.
    const head = await gh.getHead(repo, meta.default_branch, token);
    const sha = head.sha;
    const configText = await settingsTextAtSha(gh, repo, sha, token);

    let declaration = null;
    if (configText) {
      try { declaration = JSON.parse(configText); } catch { declaration = null; }
    }

    return {
      repo,
      declaration,
      defaultBranch: meta.default_branch,
      stars: meta.stars,
      archived: meta.archived,
      sha,
      head,
    };
  } catch (error) {
    return { repo, error };
  }
}

// Pass two, and the one the page exists for: every fault a row can report — a parked
// item, a blown leash, a failing scheduler — is read here. Once this pass is through
// the roster the lead card, the tiles and the ranking are true of the WHOLE fleet,
// which is why nothing below it is allowed to start first.
async function readAttention(read, token) {
  const [issuePage, runs] = await Promise.all([
    // One page is the whole live queue plus recent history, which is all a fleet row
    // needs. Deep history is the per-repo view's job.
    gh.listIssues(read.repo, token, { pages: 1 }).catch(() => ({ issues: [] })),
    // No per-page of its own: the repo view reads the same URL, and a different
    // depth here would be a second cache entry for one question.
    gh.listRuns(read.repo, token).catch(() => []),
  ]);
  read.items = issuePage.issues;
  // Whether that page reached the end of this member's history. The activity series
  // needs it to tell a quiet day from a day it simply could not see.
  read.itemsComplete = issuePage.complete;
  read.prs = issuePage.prs ?? [];
  read.runs = runs;
}

// Pass three: what stands behind the numbers rather than what they are. The tree says
// how many tasks this member declares — the difference between "quiet" and "declares
// five tasks and has never produced a work item" — and the usage fold is the member's
// own past-data plane, keyed by its head sha, so it is one read the first time a
// member's branch moves and none afterwards.
async function readDepth(read, token) {
  const [tree, usage] = await Promise.all([
    gh.listTreeAtSha(read.repo, read.sha, token).catch(() => null),
    readUsage(read.repo, read.sha, token),
  ]);
  read.paths = tree?.paths ?? null;
  read.usage = usage;
}

// Pass four: what this member's own packs report. Discovery is a match against the
// tree listing pass three fetched, so a member whose packs contribute nothing costs
// nothing to find that out; the descriptor and values reads are content at a sha and
// free on every load after the branch moves.
async function readPackCards(read, token) {
  const contributions = await readContributions({
    repo: read.repo, sha: read.sha, token, declaration: read.declaration, paths: read.paths ?? null, gh,
  });
  const needed = liveSourcesNeeded(contributions);
  const live = {
    stars: read.stars,
    // The one live read pack contributions add, and only when some declared pack
    // actually asks for it — a fleet with no release pack never spends it.
    release: needed.has('latest-release')
      ? await gh.latestRelease(read.repo, token).catch(() => undefined)
      : undefined,
  };
  for (const c of contributions) c.live = live;
  read.contributions = contributions;
  read.live = live;
}

// Pass five, and decoration by its own admission: it says how busy a repo has been.
// It withholds itself when the budget is tight, and a failure is a row without a
// graph rather than a row that could not be read. Last, because a graph missing from
// every row costs the page nothing it was opened for.
async function readCommitGraph(read, token) {
  read.commits = await gh.commitActivity(read.repo, token).catch(() => null);
}

// The last two days' briefs, from wherever the fleet keeps them. Optional in every
// direction: no `digestsRepo` configured means the panel is not part of this
// deployment, and a day with no file is a normal state rather than an error — the task
// had nothing to report, or has not run yet.
//
// Content at a path in a repo, so both reads are immutable-cacheable by sha and a warm
// load costs nothing. The 404 for a missing day is cached the same way, so a fleet
// whose digest task is idle does not re-ask every load.
async function readDigests(config, token) {
  if (!config?.digestsRepo) return null;
  brief.config = config;
  brief.token = token;
  const dates = digestDates(Date.now());
  try {
    const meta = await gh.getRepo(config.digestsRepo, token);
    brief.sha = await gh.getHeadSha(config.digestsRepo, meta.default_branch, token);
    const entries = await Promise.all(dates.map((date) => readDay(date)));
    return entries;
  } catch (error) {
    // The repo itself could not be read — a permissions fact about the viewer, not a
    // statement about any day's brief. Every day reports it rather than reading as
    // "nothing was written".
    const entries = dates.map((date) => digestEntry(date, null, error));
    for (const e of entries) brief.days.set(e.date, e);
    return entries;
  }
}

// One day's brief, read at most once per load. Content at a path in a commit, so the
// second viewer of the same day pays nothing and a day already read is not re-asked.
async function readDay(date) {
  if (brief.days.has(date)) return brief.days.get(date);
  let entry;
  try {
    const text = await gh.getTextAtSha(brief.config.digestsRepo, brief.sha, digestPath(brief.config.digestsPath, date), brief.token);
    entry = digestEntry(date, text);
  } catch (error) {
    entry = digestEntry(date, null, error);
  }
  brief.days.set(date, entry);
  return entry;
}

// --- render ---------------------------------------------------------------------

// The member grid, as three questions rather than one wall of columns:
//
//   ACTIVITY    — is anyone working on this repo.
//   WAITING     — what is on a person's plate here, and roughly how long it is.
//   CLAUDINITE  — what the machinery is doing.
//
// They are in that order because it is the order a reader asks them in: a repo nobody
// touches and a repo with a queue behind it are different problems, and what the
// scheduler is doing only matters once you know which one you are looking at.
//
// The identity pair at the left belongs to none of them. Stars, CI and the name are
// how you recognise the row; the reasons beside them are why it is where it is.
//
// Every column but one is derived from a read the page ALREADY makes. Four fields the
// issue asked for are absent for that reason and not by oversight — rule tokens, test
// counts and time saved would each need a member's own file read, and conversation-log
// sessions a branch listing. They are named in the panel's own note rather than
// guessed at. The exception is the commit graph, which is priced as decoration.
//
// `Tasks — declared` is gone, and that one WAS a read the page makes: it is the whole
// reason each member's tree is fetched. The count answered "how much is wired up
// here", which the pack count answers more directly and without a number that means
// nothing until you know which packs. The tree is still read — "declares tasks and has
// never produced a work item" is a finding only it can make.
const MEMBER_GROUPS = [
  ['', ['Member']],
  ['Activity', ['Commits']],
  ['Waiting on a person', ['Est.', 'What it is', 'Issues', 'Pull requests']],
  ['Claudinite', ['Packs', 'Queue', 'Recent outcomes', 'Scheduler']],
];

// The same split, one level down: a task's identity, where it stands right now, and
// what it has done. `Parked` sits under Now because it is a live state, not a record.
const FLEET_TASK_GROUPS = [
  ['', ['Task']],
  ['Now', ['Members', 'Open', 'Parked']],
  ['History', ['Succeeded', 'No outcome']],
];

// Reason kinds the row already SHOWS somewhere of their own — parks in the Waiting
// group with an estimate beside them, the mount as a badge on the pack count, CI as a
// dot by the name. Spelling those out again in prose was the same fact twice and, at
// 180px of sentences, the column that decided how wide the whole grid was.
//
// What is left is rare and has no cell: "declares no packs", and a scheduler fault
// the runs column reports as a state but not as a sentence. So it goes UNDER THE NAME
// when there is any, and costs nothing on the rows — nearly all of them — where there
// is not. The ranking is untouched: `summariseMember` still weighs every reason, and
// only the rendering filters, so a member at the top for a park still shows its park
// one cell to the right.
//
// Kept beside the group list, because the two move together: folding a signal into a
// mark is what puts its kind in here.
const SHOWN_ELSEWHERE = new Set(['park', 'mount', 'ci']);

const MEMBER_COLS = columnCount(MEMBER_GROUPS);
const MEMBER_STARTS = groupStarts(MEMBER_GROUPS);

// The group's first cell carries the same rule the header band draws, so the three
// questions stay legible down the length of the table.
const banded = (cells) => cells.map((cell, i) => {
  if (MEMBER_STARTS.includes(i)) cell.classList.add('group-start');
  return cell;
});

const CI_UI = {
  passing: { label: 'passing', cls: 'ok' },
  failing: { label: 'failing', cls: 'critical' },
  running: { label: 'running', cls: 'info' },
  unknown: { label: '—', cls: 'info' },
};

// THE SUBROW: what this member's packs report, one mini-card each, spanning the grid.
//
// A row rather than a fourth column group, and that is what makes the rule above it
// affordable: a column held two cards and forced an overflow marker, where a grid
// width holds six and every card a member has can simply render. SHOWN OR ABSENT —
// there is no `+n` here, and no card whose content is that some pack has something to
// say.
//
// A pack with no `fleet.member` in its descriptor contributes to the repo page only
// and is silent here; a member with nothing to report gets no subrow at all.
function contribRow(s, now) {
  const cards = [];
  for (const c of s.contributions ?? []) {
    if (c.withheld) { cards.push(miniAbsent('not read', `${c.pack} — the page declined to spend a request`)); continue; }
    const id = c.descriptor?.member;
    if (!id) continue;
    const widget = c.descriptor.widgets.get(id);
    const title = `${c.pack} · ${widget.label}`;
    const resolved = valueOf(widget, { values: c.values, live: c.live ?? s.live ?? {} });
    if (resolved.state !== 'ok') { cards.push(miniAbsent(CONTRIB_STATE_TEXT[resolved.state] ?? 'not read', title)); continue; }
    const parts = fleetPhrase(widget, resolved.value, now);
    if (!parts?.length) { cards.push(miniAbsent(CONTRIB_STATE_TEXT.absent, title)); continue; }
    cards.push(miniCard(parts, { title: `${title} — ${phraseText(parts)}`, glyph: widget.glyph }));
  }
  if (!cards.length) return null;
  // The severity class rides on the subrow too, so the edge runs the height of the
  // member rather than stopping halfway down it.
  return el('tr', { className: `contrib lvl-${s.level}` }, [
    el('td', { className: 'contrib-cell', colSpan: MEMBER_COLS }, [el('div', { className: 'minis' }, cards)]),
  ]);
}

// One member, as the rows of its own `<tbody>`: the standard metrics, then the subrow
// when it has one. They are one member and not two rows — which is what the grouping
// buys, since a `<tbody>` is what lets both highlight together on hover.
function memberRows(s, onOpen, now) {
  const open = (e) => { e.preventDefault(); onOpen(s.repo); };

  // ONE mark ahead of the name now, not two: CI, whether it builds, read as part of
  // identifying the row rather than as a finding.
  //
  // Stars used to sit here, drawn by this file. It is `git-github`'s contribution
  // instead — a descriptor and no code — and it lands in the subrow below with every
  // other thing a pack has to say. The cost is deliberate and visible: a member that
  // does not declare `git-github` has no star count anywhere, because a fact the page
  // happens to hold is not a reason to render it.
  const ciUi = CI_UI[s.ci?.state] ?? CI_UI.unknown;
  const identity = (kids) => el('td', { className: 'member-cell' }, [el('div', { className: 'member' }, [
    ciMark(ciUi, s.ci?.at ? duration(now - s.ci.at) : 'no run'),
    el('div', {}, [
      el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, className: 'name', textContent: s.repo.split('/')[1] ?? s.repo, onclick: open }),
      el('div', { className: 'sub' }, [repoLink(s.repo)]),
      ...kids,
    ]),
  ])]);
  const name = identity([]);

  if (s.status !== 'adopted') {
    return [el('tr', { className: `std lvl-${s.level} muted-row` }, [
      name,
      el('td', { colSpan: MEMBER_COLS - 2 }, reasonNodes(s.reasons)),   // the last cell is the open link
      el('td', { className: 'nw' }, [el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, textContent: 'open', onclick: open })]),
    ])];
  }

  // Whatever is left once every reason with a cell of its own is dropped — see
  // SHOWN_ELSEWHERE. Usually nothing, and then the name cell is the plain one.
  const spoken = s.reasons.filter((r) => !SHOWN_ELSEWHERE.has(r.kind));
  const identified = spoken.length ? identity(reasonNodes(spoken)) : name;

  // --- Activity: is this repo being worked on ------------------------------------

  // Where a single "3h ago" used to sit. One date says whether a repo moved today; a
  // quarter of them, as a shape, says whether it is being worked on — which is the
  // question the group is actually asking, and the reason it is no longer called
  // "Status".
  const commit = el('td', { className: 'nw' }, [
    commitGraph(s.commits, { note: s.lastCommit ? `last ${duration(now - s.lastCommit)}` : null }),
  ]);

  // --- Waiting on a person -------------------------------------------------------

  // The estimate, and immediately beside it what the estimate is made of. A number
  // with no breakdown is a number nobody can check; a breakdown with no total is a
  // list nobody can prioritise between rows.
  const attention = memberAttention(s);
  const minutes = estimateMinutes(attention);
  const est = el('td', { className: 'num nw' }, [
    el('div', { className: 'est num', textContent: minutes ? String(minutes) : '—' }),
    el('div', { className: 'sub', textContent: minutes ? 'min' : '' }),
  ]);

  const needs = attentionBreakdown(attention);
  const what = el('td', {}, needs.length
    ? [el('div', { className: 'needs' }, needs.map((r) =>
      el('div', { className: `warn ${r.level}`, textContent: `${LEVEL_GLYPH[r.level]} ${r.text}` })))]
    : [el('span', { className: 'sub', textContent: 'nothing waiting' })]);

  // --- Claudinite: what the machinery is doing here -------------------------------

  // How much Claudinite is declared here, wearing whether it is current. Two facts
  // read together, and the second is a scheduler run on nearly every row — so it earns a
  // corner of the first rather than a column beside it, with the versions on hover.
  const packs = el('td', { className: 'nw' }, [packMark(s.packs.length, s.mount)]);

  // Queue: the state mix as one thin bar plus the counts that are non-zero, so a
  // member with nothing open reads as empty rather than as a row of zeros.
  const counts = STATE_ORDER.filter((st) => s.open.byState[st] > 0)
    .map((st) => `${s.open.byState[st]} ${STATE_UI[st].label}`);
  const queue = el('td', {}, [
    segmentBar(STATE_ORDER.map((st) => [STATE_UI[st].label, s.open.byState[st], STATE_COLOR[st]]), { width: 92 }),
    el('div', { className: 'sub', textContent: counts.length ? counts.join(' · ') : 'nothing open' }),
  ]);

  const outcomes = el('td', {}, [
    segmentBar([
      ['done', s.outcomes.done, OUTCOME_COLOR.done],
      ['delivered', s.outcomes.delivered, OUTCOME_COLOR.delivered],
      ['obsolete', s.outcomes.obsolete, OUTCOME_COLOR.obsolete],
      ['no outcome', s.outcomes.none, OUTCOME_COLOR.none],
    ], { width: 92 }),
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

  // --- Work: what is waiting on a person ------------------------------------------

  // Issues that are NOT queue items, and open pull requests. Both are inside the
  // issue page's window, so an old enough one is not counted — "in the window" is
  // said once under the table rather than in every cell.
  const issues = el('td', { className: 'num nw' }, [
    el('div', { textContent: String(s.work?.issues ?? 0) }),
    el('div', { className: 'sub', textContent: s.work?.issuesOldest ? `oldest ${duration(now - s.work.issuesOldest)}` : '—' }),
  ]);

  const prs = el('td', { className: 'num nw' }, [
    el('div', { textContent: String(s.work?.prs ?? 0) }),
    el('div', {
      className: 'sub',
      textContent: s.work?.prsOldest
        ? `oldest ${duration(now - s.work.prsOldest)}${s.work.drafts ? ` · ${s.work.drafts} draft` : ''}`
        : (s.work?.drafts ? `${s.work.drafts} draft` : '—'),
    }),
  ]);

  return [
    el('tr', { className: `std lvl-${s.level}` },
      banded([identified, commit, est, what, issues, prs, packs, queue, outcomes, runs])),
    contribRow(s, now),
  ].filter(Boolean);
}

// The deployment's own cards — the fleet questions no single member's page can
// answer. Rendered from the packs the deployment repo (and the canon, when one is
// configured) declares, and absent entirely when neither contributes any.
function renderDeployment(contributions, now) {
  const section = $('fleet-contrib');
  if (!section) return;
  if (!contributions?.length) { section.hidden = true; return; }
  section.hidden = false;
  $('fleet-contrib-cards').replaceChildren(
    ...contributions.map((c) => packCard(c, now, { ids: c.descriptor.deployment })));
}

// --- what the machinery bought ---------------------------------------------------

// The block above everything else, and the only one that opens on what the machinery
// is FOR rather than on what is broken. Its content is decided in `activity.mjs`; the
// two rules that keep it honest are worth restating where it is drawn:
//
//   NO VANITY TOTAL. Every figure is this week's, against last week's. A number that
//   only ever grows is a decoration.
//
//   NOTHING INVENTED. No estimated hours saved, no multiplier, no score — only counts
//   of things that individually happened, from reads the page already made. Three
//   quantities the issue asked for are deliberately ABSENT rather than approximated:
//   checks enforced (a member's check count is not in any read this page makes),
//   anything expressed in time saved (nothing measures it), and members converged in
//   the window — a member's settings say WHAT it holds, never when it took it, since
//   #1252 deleted the datetime the tile used to count (which recorded the last full
//   re-vendor, not the last converge, and so counted the wrong thing anyway).
function renderBenefits(b, growth) {
  const node = $('fleet-benefits');
  const runsPassed = b.current.runs - b.current.runsFailed;
  const prevPassed = b.previous.runs - b.previous.runsFailed;

  // `replaceChildren` renders a null child as the text "null", so the optional tile is
  // filtered out rather than passed through.
  node.replaceChildren(...[
    windowFigure(b.current.completed, 'work items completed',
      delta(b.current.completed, b.previous.completed),
      `in ${b.current.members} member(s)`),
    windowFigure(b.current.unattended, 'of those, closed with nobody in the loop',
      delta(b.current.unattended, b.previous.unattended),
      'not parked for a human when it closed'),
    windowFigure(b.current.parked, 'items that did need a person',
      delta(b.current.parked, b.previous.parked),
      'the honest other half of the figure above', { better: 'down' }),
    windowFigure(runsPassed, 'scheduler runs passed',
      delta(runsPassed, prevPassed),
      b.current.runsFailed ? `${b.current.runsFailed} failed` : 'none failed'),
    b.digests === null ? null
      : windowFigure(b.digests, 'digests written', null, 'of the last two days'),
    // The two figures this panel used to name as ABSENT: nothing the page read could
    // count a check activation or the corpus a session carried. Both are in each
    // member's own usage file now, which the sweep reads anyway.
    //
    // Failures rather than runs, and `better: 'up'` on purpose: a check that fires is a
    // correction that happened inside the session, before the work left the branch. It
    // is the closest thing this pipeline has to a measure of what the corpus is worth.
    growth.folding === 0 ? null
      : windowFigure(growth.current.checkFailures ?? '—', 'check findings caught',
        growth.previous.checkFailures === null ? null : delta(growth.current.checkFailures ?? 0, growth.previous.checkFailures),
        `over ${growth.current.checkRuns ?? 0} runs in ${growth.folding} folding member(s)`),
    growth.tokensPerSession === null ? null
      : windowFigure(growth.tokensPerSession, 'rule tokens per session', null,
        'what the corpus costs each session before its first turn', { better: 'down' }),
  ].filter(Boolean));
}

// --- the digests panel -----------------------------------------------------------

const BLOCK_TAG = { title: 'h3', section: 'h4', item: 'li', para: 'p' };

// One card per day. The brief is plain text by its writer's contract, so this is
// headings, paragraphs and links — never a Markdown renderer, which would be the wrong
// reader for the file and a dependency for a page that has none.
function digestCard(entry, repo, dir) {
  const kids = [el('div', { className: 'k', textContent: entry.date })];

  if (entry.state === 'missing') {
    kids.push(el('p', { className: 'sub', textContent: 'No brief for this day — the digest task had nothing to report, or has not run.' }));
  } else if (entry.state === 'unreadable') {
    kids.push(el('p', { className: 'sub', textContent: `Not read — ${entry.error?.message ?? 'the digest repo could not be read'}.` }));
  } else if (entry.state === 'empty') {
    kids.push(el('p', { className: 'sub', textContent: 'The file for this day is empty.' }));
  }

  let list = null;
  for (const b of entry.blocks) {
    const nodes = b.runs.map((r) => (r.href
      ? el('a', { href: r.href, target: '_blank', rel: 'noopener', textContent: r.text })
      : r.text));
    if (b.kind === 'item') {
      if (!list) { list = el('ul', { className: 'digest-items' }); kids.push(list); }
      list.append(el('li', {}, nodes));
      continue;
    }
    list = null;
    kids.push(el(BLOCK_TAG[b.kind] ?? 'p', {}, nodes));
  }

  if (entry.state === 'written' && repo) {
    kids.push(el('div', { className: 'sub' }, [
      el('a', {
        href: `https://github.com/${repo}/blob/HEAD/${digestPath(dir, entry.date)}`,
        target: '_blank', rel: 'noopener', textContent: 'the file',
      }),
    ]));
  }
  return el('div', { className: 'chart-card digest' }, kids);
}

// The day the picker is on, and the days already read. Module state rather than a
// parameter because the fleet page repaints on every member's read landing, and a
// picker whose day reset itself a dozen times during the sweep would be unusable.
const brief = { config: null, token: null, sha: null, days: new Map(), back: 1 };

function showDay(back) {
  brief.back = Math.min(MAX_DAYS_BACK, Math.max(1, back));
  const date = digestDate(Date.now(), brief.back);
  renderBrief();
  // Already-read days render from the cache above and never reach this.
  if (!brief.days.has(date) && brief.sha) readDay(date).then(renderBrief).catch(() => renderBrief());
}

function renderBrief() {
  const section = $('lead-digest-section');
  if (!brief.config?.digestsRepo) { section.hidden = true; return; }
  section.hidden = false;

  const date = digestDate(Date.now(), brief.back);
  const entry = brief.days.get(date) ?? null;
  $('fleet-digest').replaceChildren(entry
    ? digestCard(entry, brief.config.digestsRepo, brief.config.digestsPath)
    : el('div', { className: 'chart-card lead-card digest' }, [
      el('div', { className: 'k', textContent: date }),
      el('p', { className: 'sub', textContent: 'Reading…' }),
    ]));

  // Older to the left, newer to the right, and the ends are disabled rather than
  // hidden: a control that vanishes at a boundary reads as a page that broke.
  $('digest-nav').replaceChildren(
    el('button', {
      type: 'button', textContent: '‹', title: 'the day before',
      disabled: brief.back >= MAX_DAYS_BACK,
      onclick: () => showDay(brief.back + 1),
    }),
    el('span', { className: 'sub', textContent: brief.back === 1 ? 'yesterday' : `${brief.back} days ago` }),
    el('button', {
      type: 'button', textContent: '›', title: 'the day after',
      disabled: brief.back <= 1,
      onclick: () => showDay(brief.back - 1),
    }),
  );
}

// --- the activity panel ----------------------------------------------------------

// The one panel that answers "what has this fleet been doing". Everything else here
// is fault-finding, and fault-finding cannot distinguish a good week from a dead one:
// healthy means every count is zero, and so does abandoned.
//
// Two charts rather than one, because the two series answer different questions and
// share no scale: work CLOSED is the fleet's output, runs are the machinery that
// produced it, and stacking them together would let a noisy scheduler read as
// productivity.
const WORK_SERIES = [
  { label: 'done', color: OUTCOME_COLOR.done, value: (d) => d.work.done },
  { label: 'delivered', color: OUTCOME_COLOR.delivered, value: (d) => d.work.delivered },
  { label: 'obsolete', color: OUTCOME_COLOR.obsolete, value: (d) => d.work.obsolete },
  { label: 'no outcome', color: OUTCOME_COLOR.none, value: (d) => d.work.none },
  { label: 'other issues closed', color: 'var(--s-blue)', value: (d) => d.otherClosed },
];

const RUN_SERIES = [
  { label: 'runs passed', color: 'var(--good)', value: (d) => d.runs.success },
  { label: 'runs failed', color: 'var(--critical)', value: (d) => d.runs.failure },
  { label: 'runs other', color: 'var(--muted)', value: (d) => d.runs.other },
];

const CORPUS_SERIES = [
  { label: 'checks executed', color: 'var(--good)', value: (d) => d.checkRuns },
  { label: 'of those, catching something', color: 'var(--critical)', value: (d) => d.checkFailures },
];

// What the corpus did across the fleet, from the members' own folds. Runs and findings
// share a scale here — unlike the repo page's rule-tokens-against-checks pair — because
// the second is a SUBSET of the first and reading it as a share is the whole point.
function corpusCard(growth) {
  if (!growth.folding) {
    return el('div', { className: 'chart-card' }, [
      el('div', { className: 'k', textContent: 'no member folds a usage file yet' }),
      el('p', {
        className: 'sub',
        textContent: 'Check activations and the corpus each session carries come from each member\'s own '
          + '.claudinite/local/usage.GENERATED.json, written by the claudinite-growth pack\'s usage-fold task.',
      }),
    ]);
  }
  return el('div', { className: 'chart-card' }, [
    el('div', {
      className: 'k',
      textContent: `${growth.current.checkRuns ?? 0} check run(s) this week across ${growth.folding}/${growth.members} member(s)`,
    }),
    chartLegend(CORPUS_SERIES),
    stackedColumns(growth.days, CORPUS_SERIES),
    // The census the retired fleet aggregate carried as `coverage.absent`, derived live:
    // a denominator with an invisible hole in it is worse than no denominator at all.
    growth.absent.length
      ? el('div', {
        className: 'sub',
        textContent: `not folding, so counted in none of this: ${growth.absent.map((r) => r.split('/')[1] ?? r).join(', ')}`,
      })
      : el('div', { className: 'sub', textContent: 'every readable member folds one' }),
  ]);
}

function renderActivity(series, growth) {
  const charts = $('fleet-activity');
  const pass = series.totals.runs
    ? Math.round(((series.totals.runs - series.totals.runsFailed) / series.totals.runs) * 100)
    : null;

  // Which members moved AT ALL. A fleet where two of twelve did anything is a fact
  // about the fleet, and it is invisible in any per-member row.
  const movement = el('div', { className: 'movement' }, [
    el('div', { className: 'v num', textContent: `${series.moved.length}/${series.members}` }),
    el('div', { className: 'k', textContent: 'members moved in the window' }),
    el('div', { className: 'sub', textContent: series.quiet.length ? `quiet: ${series.quiet.map((r) => r.split('/')[1] ?? r).join(', ')}` : 'every readable member did something' }),
    series.unread ? el('div', { className: 'sub', textContent: `${series.unread} member(s) unread — not counted either way` }) : null,
  ]);

  charts.replaceChildren(
    el('div', { className: 'chart-card' }, [
      el('div', { className: 'k', textContent: `${series.totals.workClosed} work items closed · ${series.totals.otherClosed} other issues` }),
      chartLegend(WORK_SERIES),
      stackedColumns(series.days, WORK_SERIES),
      // A window that reaches past what one issue page holds is a floor, not a count,
      // and a chart that does not say so reads as a fleet that went quiet.
      series.horizon.issues
        ? el('div', { className: 'sub', textContent: `before ${series.horizon.issues} this is a floor — one issue page per member does not reach further back` })
        : null,
    ]),
    el('div', { className: 'chart-card' }, [
      el('div', { className: 'k', textContent: pass == null ? 'no scheduler runs in the window' : `${series.totals.runs} runs · ${pass}% passed` }),
      chartLegend(RUN_SERIES),
      stackedColumns(series.days, RUN_SERIES),
      series.horizon.runs
        ? el('div', { className: 'sub', textContent: `before ${series.horizon.runs} this is a floor — the last 30 runs per member do not reach further back` })
        : null,
    ]),
    corpusCard(growth),
    el('div', { className: 'chart-card' }, [movement]),
  );
}

// A member whose read has not landed yet. It is a row from the first paint rather
// than a gap that fills in, because a fleet page that appears all at once at the end
// looks broken for the whole sweep — and on a slow or throttled read, the sweep is
// most of the time the viewer spends here.
const pendingRow = (repo) => el('tr', { className: 'pending-row' }, [
  el('td', {}, [el('div', { className: 'member' }, [
    el('div', {}, [
      el('span', { className: 'name', textContent: repo.split('/')[1] ?? repo }),
      el('div', { className: 'sub' }, [repoLink(repo)]),
    ]),
  ])]),
  el('td', { colSpan: MEMBER_COLS - 1 }, [el('span', { className: 'sub', textContent: 'reading…' })]),
]);

function renderFleet(summaries, reads, now, onOpen, canon, progress = null, digests = null, deployment = null) {
  const resolved = summaries.filter(Boolean);
  const pending = summaries.map((s, i) => (s ? null : reads.names?.[i])).filter(Boolean);
  const roll = rollUp(resolved);

  // The prod, before every panel that reports. Mid-sweep it says so rather than
  // claiming a clean fleet: "nothing is waiting on you" read off four of forty members
  // is a wrong statement, not a partial one.
  const candidates = fleetCandidates(resolved);
  const sweeping = progress && progress.done < progress.total;
  $('fleet-lead').replaceChildren(!candidates.length && sweeping
    ? el('div', { className: 'chart-card lead-card' }, [
      el('div', { className: 'lead-why', textContent: 'Reading the fleet…' }),
      el('div', { className: 'sub', textContent: `${progress.done}/${progress.total} members read — nothing waiting on you in those.` }),
    ])
    : leadCard(candidates[0] ?? null, {
      rest: candidates.length - 1,
      onRepo: onOpen,
      minutes: parkMinutes(candidates[0]?.park),
      note: parkMinutesNote(candidates[0]?.park),
    }));

  // The headline tile counts MEMBERS, which is the length of the morning's list — but
  // the list is only actionable once it says what kind of attention each is waiting
  // for. Three merges to approve and three broken lanes are not the same morning.
  const attention = fleetAttention(roll);
  const needs = attentionBreakdown(attention);

  tiles($('fleet-tiles'), [
    [roll.needAttention, 'members need you', roll.needAttention ? 'var(--critical)' : null,
      needs.length
        ? el('div', { className: 'needs' }, needs.map((r) =>
          el('div', { className: `warn ${r.level}`, textContent: `${LEVEL_GLYPH[r.level]} ${r.text}` })))
        : 'nothing is on fire'],
    [roll.parkedItems, 'items parked', roll.parkedItems ? 'var(--critical)' : null,
      roll.parkedMembers ? `across ${roll.parkedMembers} member(s)` : ''],
    [roll.failingMembers, 'schedulers failing', roll.failingMembers ? 'var(--critical)' : null,
      roll.neverRan ? `${roll.neverRan} never ran` : ''],
    [roll.behindMembers, 'mounts behind', roll.behindMembers ? 'var(--serious)' : null,
      canon ? (canon.engineVersion != null ? `canon engine v${canon.engineVersion}` : 'canon versions unreadable') : 'no canon configured'],
    [estimateMinutes(attention), 'minutes of your time', null, estimateNote(attention)],
    [roll.openItems, 'open work items', null, `${roll.inFlight} run(s) in flight`],
    [`${roll.adopted}/${roll.members}`, 'members adopted', null,
      [roll.notAdopted ? `${roll.notAdopted} not adopted` : '', roll.unreadable ? `${roll.unreadable} unreadable` : ''].filter(Boolean).join(', ')],
  ]);

  // Every number above is a number about the members READ SO FAR, and a partial
  // rollup that does not say so is a wrong one. The count is stated rather than the
  // page waiting to be sure.
  //
  // Ranked is not the same as finished. Once every member has been through the
  // attention pass the figures are true of the whole fleet, but the passes behind
  // them — trees, folds, pack cards, graphs — are still filling columns in, and a
  // line reading "40 repos read" over a table still growing columns claims a
  // completeness the page does not have yet. So the pass says so while it runs.
  $('fleet-progress').textContent = progress && progress.done < progress.total
    ? `${progress.done}/${progress.total} repos read — figures below cover those`
    : (progress
      ? `${progress.total} repos read${progress.label ? ` — ${progress.label.toLowerCase()}…` : ''}`
      : '');

  // One `<tbody>` per member — see `memberRows`. The head's own tbody carries the
  // empty state and the still-reading rows, and is moved to the END once the members
  // are in, so a repo still being read does not appear above the ones already ranked.
  const table = $('fleet');
  const body = groupedHead(table, MEMBER_GROUPS);
  if (!summaries.length) { body.append(emptyRow(MEMBER_COLS, 'No members in the roster.')); return; }
  for (const s of rankMembers(resolved)) table.append(el('tbody', { className: 'm' }, memberRows(s, onOpen, now)));
  for (const repo of pending) body.append(pendingRow(repo));
  table.append(body);

  // Tasks across the fleet. This is the view a per-repo page structurally cannot
  // give: a shared pack's task parked in four members at once is a canon problem,
  // and in any single repo it looks like that repo's bad luck.
  const resolvedReads = reads.filter(Boolean);
  renderBrief();
  renderDeployment(deployment, now);
  const growth = fleetGrowth(resolvedReads, { now });
  renderBenefits(fleetBenefits(resolvedReads, { now, digests }), growth);
  renderActivity(activitySeries(resolvedReads, { now }), growth);

  const spread = taskSpread(resolvedReads, now).filter((t) => t.members > 0);
  const tbody = groupedHead($('fleet-tasks'), FLEET_TASK_GROUPS);
  if (!spread.length) tbody.append(emptyRow(columnCount(FLEET_TASK_GROUPS), 'No work items seen across the fleet.'));
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
  // Read before the sweep so the panel is there from the first paint: it is two small
  // reads, and it is the thing a viewer opening this page in the morning came for.
  const digests = await readDigests(config, token);

  // Rendered on every arrival rather than once at the end: the page is useful from
  // the first member back, and the member a viewer opened it for may be the first.
  const reads = new Array(repos.length).fill(null);
  reads.names = repos;
  const summaries = new Array(repos.length).fill(null);
  // The deployment's own cards, read once. Its repos are usually members too, so on a
  // fleet page this is served out of the same caches the sweep fills.
  let deployment = null;
  // What the page is allowed to claim right now: how many members are RANKED (not how
  // many have been touched), and which pass is filling the rest in.
  let progress = { done: 0, total: repos.length, label: null };
  const paint = () => renderFleet(summaries, reads, now, onOpen, canon, progress, digests, deployment);
  paint();
  readDeploymentContributions({ config, token, gh })
    .then((d) => { deployment = d; paint(); })
    .catch(() => { /* a deployment card that cannot be read is a section that stays hidden */ });

  // One state object per member, carried through every pass and filled in as the
  // passes reach it.
  const members = repos.map((repo, i) => ({ repo, i, read: null }));
  // Who each pass after the first has anything to ask about. A repo that does not run
  // Claudinite, and one whose first read failed, are both already everything the page
  // will ever say about them.
  const adopted = (m) => Boolean(m.read?.declaration) && !m.read?.error;

  await sweepPhases({
    members,
    phases: [
      {
        id: 'identity',
        label: 'Identifying members',
        run: async (m) => {
          m.read = await readIdentity(m.repo, token);
          reads[m.i] = m.read;
          // The canon side of the mount comparison, priced from what this member
          // stamps. In this pass rather than beside the summary, so every member's
          // packs are priced before the first row claims a mount is current.
          await priceStampedPacks(canon, m.read.declaration);
        },
      },
      { id: 'attention', label: 'Reading queues', appliesTo: adopted, run: (m) => readAttention(m.read, token) },
      { id: 'depth', label: 'Reading trees and folds', appliesTo: adopted, run: (m) => readDepth(m.read, token) },
      { id: 'packs', label: 'Reading what the packs report', appliesTo: adopted, run: (m) => readPackCards(m.read, token) },
      { id: 'activity', label: 'Reading commit graphs', appliesTo: adopted, run: (m) => readCommitGraph(m.read, token) },
    ],
    onAdvance: ({ phase, label, done, total, member }) => {
      if (member?.read) {
        // A member is summarised as soon as it is finished being a candidate for a
        // later pass to change — which for an adopted member is when the attention
        // pass lands, never before it: `summariseMember` reads an unread queue as an
        // empty one, and a row saying "nothing parked" about a member whose issues
        // have not been fetched is a wrong statement rather than a partial one.
        const ranked = phase !== 'identity' || !adopted(member);
        if (ranked) summaries[member.i] = summariseMember(member.read, { now, canon });
      }
      progress = { done: summaries.filter(Boolean).length, total: repos.length, label };
      onProgress?.({ phase, label, done, total, repo: member?.repo ?? null });
      paint();
    },
  });

  const failed = summaries.filter((s) => s?.status === 'unreadable');
  // Surfaced once at the top rather than as twelve separate errors: on a fleet, some
  // members being invisible to you is the normal case, not an incident.
  if (failed.length === repos.length && repos.length > 0) {
    onError?.(`None of the ${repos.length} members could be read — check that you are signed in with an account that can see them.`);
  }

  progress = { done: summaries.filter(Boolean).length, total: repos.length, label: null };
  paint();
  return { summaries: summaries.filter(Boolean), now, canon, digests };
}
