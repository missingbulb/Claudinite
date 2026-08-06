#!/usr/bin/env node
// The sheepdog pack's fleet-FRESHNESS sweep — the second half of the enforcer's job.
// Run by this pack's `fleet-freshness` scheduled task (tasks/fleet-freshness/), whose
// worker calls `main()` below as the task's `prework`, Action-side inside
// the enforcer repo's scheduler workflow where FLEET_GITHUB_TOKEN is reachable. Still
// runnable by hand (`node check-fleet-freshness.mjs`) via the CLI guard at the foot.
//
// WHY IT EXISTS. Under per-project scheduling every member maintains ITSELF: its own
// vendored `claudinite-scheduler.yml` fires hourly, and its `baselining` task re-vendors
// the mount from canon. That is the right architecture — and it removed the last thing
// that ever looked at a member from the outside. A member whose scheduler was never
// vendored, whose workflow was deleted, or whose baselining has been failing for a
// fortnight is now invisible: it is `covered` to the census (it still carries a
// declaration), it files no failure issue (nothing runs to fail), and it silently drifts.
// Self-maintenance cannot detect its own absence. This sweep is the outside look.
//
// ITS CONCERN IS FRESHNESS ALONE — is each COVERED member actually keeping up? The
// census (check-fleet-coverage.mjs) asks the prior question, whether a repo is covered
// at all, and opens adoption issues; this one takes coverage as given and asks whether
// coverage is still MEANING anything. An uncovered repo is skipped here, not
// double-reported — and so is a member that declares itself DORMANT: its scheduler
// stops before it evaluates anything, so its mount falls behind by design, and every
// classification below would report a repo for obeying its own declaration.
//
// The classification is deliberately about ROOT CAUSE, in precedence order:
//   no-stamp        declares packs but was never vendored — no engine on disk at all
//   no-scheduler    no vendored scheduler workflow — it has no cron, so it will
//                   never baseline itself, and every other symptom follows from this
//   ref-not-on-trunk  the stamped ref is not an ancestor of canon's default branch
//                   (or is not a canon commit at all) — vendoring's #328 anti-rewind
//                   guard refuses to write over it, so the repo is WEDGED, not merely late
//   behind          on trunk, but the commit it is stamped at is older than staleDays
//                   while canon has moved on — baselining has stopped landing
//
// THE ONE ASSUMPTION, stated plainly: baselining reverts a stamp-only bump, so
// `claudinite.updated` advances only when canon actually changed that member's vendor
// set. Age of the STAMPED REF is therefore the honest liveness measure, and `behind`
// reads "this member has not picked canon up in staleDays" — not "canon moved". It can
// still misfire on a member whose vendor set genuinely saw no change in that window;
// `staleDays` (default 14) is the knob, and the issue body says so.
//
// Same two rules the census keeps: an indeterminate repo is UNKNOWN, never a finding —
// no issue is opened for it and the run fails so the cause escalates; and an unreadable
// config aborts rather than silently sweeping a fleet it cannot scope.
//
// Dependency-free (global fetch, Node 20+); read-only toward every member, and writes
// only the enforcer repo's own drift issues + label.
//
// It lives IN its task's folder (tasks/fleet-freshness/) because nothing else uses it —
// only this task's worker.mjs imports it. What IS shared with the census sits at the
// pack root: the cross-repo REST primitives (fleet-api.mjs) and the config reader
// (fleet-config.mjs).

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, paged, ensureLabel, labeledIssues, readDeclaration, isDormant, DECLARATION } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';

const LABEL = 'fleet-drift';
const SCHEDULER = '.github/workflows/claudinite-scheduler.yml';

export const FRESH = 'fresh';
const driftTitle = (fullName) => `Claudinite mount has fallen behind on ${fullName}`;
const TITLE_RE = /^Claudinite mount has fallen behind on (\S+\/\S+)$/;
// A machine-readable state marker in the body: it lets a later run notice that the
// ROOT CAUSE changed (a repo that was `behind` is now `no-scheduler`) and say so,
// without any cross-run state to keep — the issue carries its own last verdict.
const marker = (state) => `<!-- fleet-freshness: ${state} -->`;
const MARKER_RE = /<!-- fleet-freshness: ([a-z-]+) -->/;

// --- classification (pure) ----------------------------------------------------

// `compare` is what canon's compare endpoint said about `stampedRef → canon default
// branch`, normalized to { status, aheadBy, baseDateMs }, or null when the ref is not
// a commit in canon at all. Kept free of I/O so every branch is testable directly.
export function classifyFreshness({ stampedRef, hasScheduler, compare, nowMs, staleDays }) {
  if (!stampedRef) {
    return { state: 'no-stamp', detail: `${DECLARATION} carries no claudinite.ref — the repo declares packs but has never been vendored` };
  }
  if (!hasScheduler) {
    return { state: 'no-scheduler', detail: `no ${SCHEDULER} — the repo has no cron, so nothing there will ever baseline it` };
  }
  if (compare === null) {
    return { state: 'ref-not-on-trunk', detail: `the stamped ref ${stampedRef} is not a commit in canon` };
  }
  // base=stampedRef, head=canon default branch. An ancestor reads `identical` or
  // `ahead`; `behind`/`diverged` means the stamp points off trunk (a force-push, a
  // ref vendored from a branch), which is exactly what the #328 guard refuses.
  if (compare.status !== 'identical' && compare.status !== 'ahead') {
    return { state: 'ref-not-on-trunk', detail: `the stamped ref ${stampedRef} is not an ancestor of canon's default branch (compare says "${compare.status}")` };
  }
  const ageDays = (nowMs - compare.baseDateMs) / 86_400_000;
  if (compare.aheadBy > 0 && ageDays > staleDays) {
    return {
      state: 'behind',
      detail: `stamped at ${stampedRef} (${Math.floor(ageDays)} days old), ${compare.aheadBy} canon commit(s) behind — over the ${staleDays}-day window`,
    };
  }
  return { state: FRESH, detail: compare.aheadBy > 0 ? `${compare.aheadBy} canon commit(s) behind, within the ${staleDays}-day window` : 'at canon head' };
}

// --- issue bodies -------------------------------------------------------------

const FIXES = {
  'no-stamp': [
    'Run the adoption flow against the repo (the `adopt-claudinite` skill) — it vendors the',
    'mount and writes the first stamp. Until then the declaration names packs whose code is',
    'not present, so nothing Claudinite defines actually runs there.',
  ],
  'no-scheduler': [
    'The repo never cut over to per-project scheduling. Vendor the scheduler',
    '(`vendoring/apply-vendor-set.mjs` writes it, with this repo\'s hashed cron minute) and',
    'confirm the workflow is enabled in the Actions tab — a repo with no cron runs no task',
    'at all, so every other symptom is downstream of this one.',
  ],
  'ref-not-on-trunk': [
    'This is a WEDGE, not a delay: `apply-vendor-set.mjs` refuses to write when the prior',
    'stamped ref is not an ancestor of canon HEAD (#328, the anti-rewind guard), so',
    'baselining fails on every run and will keep failing. Check whether canon was',
    'force-pushed or the mount was vendored from a branch, then re-stamp the repo at a',
    'commit that IS on the default branch.',
  ],
  behind: [
    'The scheduler workflow exists but its baselining is not landing. Check the repo\'s',
    'recent `Claudinite scheduler` runs: a disabled workflow (GitHub disables cron on repos',
    'with no activity for 60 days), a failing baselining task, or a maintenance PR that',
    'never merges all look like this.',
    '',
    'If instead this member\'s vendor set legitimately saw no change in the window, the',
    'window is wrong, not the repo — raise `staleDays` on the sheepdog pack entry\'s config.',
  ],
};

function driftBody(fullName, { state, detail }, staleDays) {
  return [
    marker(state),
    `\`${fullName}\` is covered — it carries a tracked \`${DECLARATION}\` — but it is not keeping up with canon.`,
    '',
    `**What the sweep found (${state}):** ${detail}`,
    '',
    '**What to do**',
    '',
    ...FIXES[state],
    '',
    `This issue is converged by the weekly fleet-freshness task (window: ${staleDays} days): it closes`,
    'itself `completed` once the repo is fresh again, and `not planned` once the repo leaves the',
    'fleet (excluded, deleted, archived, or no longer covered). A close without either gets',
    'reopened while the repo stays behind.',
  ].join('\n');
}

// --- convergence --------------------------------------------------------------

// One issue per unhealthy member, keyed by a title that names only the repo — so the
// root cause can change without orphaning the thread. Deliberately quieter than the
// census on the way in: an already-open issue gets a comment ONLY when the state
// actually changed, because a weekly sweep over a fleet that is slow to heal would
// otherwise turn every thread into a wall of identical notes.
export async function convergeDrift(gh, home, { unhealthy, healthySet, goneSet, dormantSet = new Set(), staleDays }) {
  const actions = [];
  const { open: openIssues, closed } = await labeledIssues(gh, home, LABEL);
  const open = new Map(openIssues.map((i) => [i.title, i]));
  const wanted = new Map(unhealthy.map((u) => [u.fullName, u]));

  for (const [fullName, verdict] of wanted) {
    const title = driftTitle(fullName);
    const existing = open.get(title);
    if (existing) {
      const was = MARKER_RE.exec(existing.body ?? '')?.[1];
      if (was === verdict.state) continue; // same story as last week — say nothing
      await gh(`/repos/${home}/issues/${existing.number}`, {
        method: 'PATCH', body: { body: driftBody(fullName, verdict, staleDays) },
      });
      await gh(`/repos/${home}/issues/${existing.number}/comments`, {
        method: 'POST', body: { body: `The sweep's verdict changed: \`${was ?? 'unrecorded'}\` → \`${verdict.state}\`. ${verdict.detail}.` },
      });
      actions.push(`updated #${existing.number} (${fullName}: ${was ?? 'unrecorded'} → ${verdict.state})`);
      continue;
    }
    const prior = closed.filter((i) => i.title === title)
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];
    if (prior && prior.state_reason === 'not_planned') continue; // closed as out-of-fleet; re-adding it is the standing fix
    if (prior) {
      await gh(`/repos/${home}/issues/${prior.number}`, {
        method: 'PATCH', body: { state: 'open', body: driftBody(fullName, verdict, staleDays) },
      });
      await gh(`/repos/${home}/issues/${prior.number}/comments`, {
        method: 'POST', body: { body: `Reopened by the sweep: \`${fullName}\` has fallen behind again (${verdict.state}). ${verdict.detail}.` },
      });
      actions.push(`reopened #${prior.number} (${fullName}: ${verdict.state})`);
    } else {
      const { status, json } = await gh(`/repos/${home}/issues`, {
        method: 'POST',
        body: { title, body: driftBody(fullName, verdict, staleDays), labels: [LABEL] },
      });
      if (status !== 201) throw new Error(`creating drift issue for ${fullName} returned ${status}`);
      actions.push(`opened #${json.number} (${fullName}: ${verdict.state})`);
    }
  }

  for (const [title, issue] of open) {
    const m = TITLE_RE.exec(title);
    if (!m) continue;
    const fullName = m[1].toLowerCase();
    if (wanted.has(fullName)) continue;
    let reason = null; let note = null;
    if (healthySet.has(fullName)) {
      reason = 'completed'; note = 'is up to date with canon again';
    } else if (dormantSet.has(fullName)) {
      // `not planned`, not `completed`: the drift was never fixed, the repo was
      // taken out of the race. Closing it `completed` would claim a repair nobody
      // made, and leaving it open would be the nagging dormancy exists to stop.
      reason = 'not_planned'; note = 'has declared itself dormant — it is out of the recurring work, so the sweep no longer measures it';
    } else if (goneSet.has(fullName)) {
      reason = 'not_planned'; note = 'is no longer a covered member of the fleet (excluded, deleted, archived, or uncovered)';
    }
    if (!reason) continue; // classified UNKNOWN this run — say nothing rather than guess
    await gh(`/repos/${home}/issues/${issue.number}/comments`, {
      method: 'POST', body: { body: `Closed by the sweep: \`${m[1]}\` ${note}.` },
    });
    await gh(`/repos/${home}/issues/${issue.number}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: reason },
    });
    actions.push(`closed #${issue.number} (${m[1]}: ${note})`);
  }
  return actions;
}

// --- per-member probe ---------------------------------------------------------

// Three reads per member: the declaration (content, not just existence — the stamp is
// in it), the scheduler workflow's presence, and canon's view of the stamped ref.
// Throws on anything indeterminate; the caller turns that into UNKNOWN. Exported so
// the "a dormant member is never probed further" contract is testable without a
// network — it is a decision, not plumbing.
export async function probe(gh, fullName, { canonRepo, canonBranch }) {
  const cfg = await readDeclaration(gh, fullName);
  if (cfg === null) return null; // uncovered — the census's business, not this sweep's
  // A DORMANT member is not measured. Its scheduler stops before it evaluates
  // anything, so nothing there baselines and the mount falls behind BY DESIGN —
  // every question below would answer "behind" for a repo that was told to stop
  // keeping up. Reporting that is not an outside look, it is nagging a repo for
  // obeying its own declaration. Detected here, before the stamp is even read.
  if (isDormant(cfg)) return { dormant: true };
  const stampedRef = cfg?.claudinite?.ref ?? null;

  const wf = await gh(`/repos/${fullName}/contents/${SCHEDULER}`);
  if (wf.status !== 200 && wf.status !== 404) throw new Error(`${SCHEDULER} check returned ${wf.status}`);
  const hasScheduler = wf.status === 200;

  let compare = null;
  if (stampedRef) {
    // per_page=1 because the commit list is irrelevant here — only the counts, the
    // status, and the base commit's date are read, and a wide-open compare over a
    // fortnight of canon is a needlessly large payload.
    const c = await gh(`/repos/${canonRepo}/compare/${stampedRef}...${canonBranch}?per_page=1`);
    if (c.status === 404) compare = null; // not a canon commit — classify(), not an error
    else if (c.status !== 200 || !c.json) throw new Error(`comparing ${stampedRef} against ${canonRepo}@${canonBranch} returned ${c.status}`);
    else {
      compare = {
        status: c.json.status,
        aheadBy: c.json.ahead_by ?? 0,
        baseDateMs: Date.parse(c.json.base_commit?.commit?.committer?.date ?? ''),
      };
      if (!Number.isFinite(compare.baseDateMs)) throw new Error(`canon returned no usable date for ${stampedRef}`);
    }
  }
  return { stampedRef, hasScheduler, compare };
}

// --- main ---------------------------------------------------------------------

export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read + Issues read/write) — '
      + 'the default GITHUB_TOKEN sees only this repo and cannot sweep the fleet.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, exclude, canonRepo, staleDays } = parseSheepdogConfig(cfg, home);

  // Canon's default branch is what "on trunk" means; read it rather than assuming main.
  const canonRes = await gh(`/repos/${canonRepo}`);
  if (canonRes.status !== 200 || !canonRes.json?.default_branch) {
    throw new Error(`canon repo ${canonRepo} is unreadable (status ${canonRes.status}) — set canonRepo on the sheepdog pack entry's config if it is not ${owner}/Claudinite`);
  }
  const canonBranch = canonRes.json.default_branch;

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope; `
      + 'refusing to run a sweep that would close every drift issue as stale');
  }

  const unhealthy = []; const healthy = []; const gone = []; const dormant = []; const unknown = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    if (fullName === home.toLowerCase()) continue;         // the enforcer is swept by its own scheduler
    if (fullName === canonRepo.toLowerCase()) continue;    // canon has no vendored mount to be stale
    if (r.archived || r.fork || exclude.has(fullName)) { gone.push(fullName); continue; }
    let p;
    try {
      p = await probe(gh, r.full_name, { canonRepo, canonBranch });
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
      continue;
    }
    if (p === null) { gone.push(fullName); continue; }     // uncovered: the census owns it
    // Dormant by its own declaration: out of the sweep, and counted SEPARATELY from
    // `gone` so the summary says how much of the fleet is asleep rather than hiding
    // it inside "out of scope". An open drift issue on it closes with its own note.
    if (p.dormant) { dormant.push(fullName); continue; }
    const verdict = classifyFreshness({ ...p, nowMs: Date.now(), staleDays });
    if (verdict.state === FRESH) healthy.push(fullName);
    else unhealthy.push({ fullName, ...verdict });
  }

  await ensureLabel(gh, home, LABEL, { color: 'D93F0B', description: 'Covered member whose Claudinite mount has fallen behind canon' });
  const actions = await convergeDrift(gh, home, {
    unhealthy, healthySet: new Set(healthy), goneSet: new Set(gone), dormantSet: new Set(dormant), staleDays,
  });

  const summary = [
    `# Fleet freshness sweep — ${owner} (window: ${staleDays} days, canon: ${canonRepo}@${canonBranch})`,
    '',
    '| fresh | behind | no scheduler | no stamp | off trunk | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${healthy.length} | ${unhealthy.filter((u) => u.state === 'behind').length} | `
      + `${unhealthy.filter((u) => u.state === 'no-scheduler').length} | `
      + `${unhealthy.filter((u) => u.state === 'no-stamp').length} | `
      + `${unhealthy.filter((u) => u.state === 'ref-not-on-trunk').length} | ${dormant.length} | ${gone.length} | ${unknown.length} |`,
    '',
    unhealthy.length
      ? `**Behind (drift issue open):**\n${unhealthy.map((u) => `- \`${u.fullName}\` — **${u.state}**: ${u.detail}`).join('\n')}`
      : '**Every covered member is up to date 🎉**',
    dormant.length ? `**Dormant (self-declared, not measured):** ${dormant.join(', ')}` : '',
    unknown.length ? `**UNKNOWN (probe errored — fix the token/scope):** ${unknown.join('; ')}` : '',
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
  ].filter(Boolean).join('\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  if (unknown.length) {
    throw new Error(`${unknown.length} repo(s) could not be probed — unknown is not behind, `
      + 'no drift issues were opened for them, and this run fails so the cause is escalated');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-freshness sweep failed: ${e.message}`); process.exit(1); });
}
