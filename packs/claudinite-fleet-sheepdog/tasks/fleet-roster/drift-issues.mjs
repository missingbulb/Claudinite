// The FRESHNESS half of the fleet-roster sweep: the `fleet-drift` issue family, the
// root-cause classification behind it, and the freshness section of the run report.
//
// It holds no enumeration and no membership classification — the roster is built once,
// for both halves, by its sibling check-fleet-roster.mjs, which hands this module only
// the members it has already established are covered, awake, in scope and this sweep's
// to measure. What lives here is everything specific to the freshness QUESTION. Its
// counterpart is adoption-issues.mjs, which owns the same three things for the coverage
// question; the two never import each other.
//
// WHY THE QUESTION EXISTS. Under per-project scheduling every member maintains ITSELF:
// its own vendored `claudinite-scheduler.yml` fires hourly, and its `baselining` task
// re-vendors the mount from canon. That is the right architecture — and it removed the
// last thing that ever looked at a member from the outside. A member whose scheduler
// was never vendored, whose workflow was deleted, or whose baselining has been failing
// for a fortnight is otherwise invisible: it still carries a declaration, so the
// coverage half calls it covered, and it files no failure issue because nothing runs
// there to fail. Self-maintenance cannot detect its own absence.
//
// WHAT `behind` MEASURES: the VERSION GAP, and nothing else. The versioned update
// flows stamp `engineVersion` and `packVersions` and deliberately never rewrite `ref`
// or `updated`, so on a well-maintained member the stamped ref is frozen at whatever
// commit first vendored it and its AGE measures nothing at all. A date measure over
// that stamp does not decay gracefully either: every member's ref ages at the same
// rate, so one arbitrary day the whole fleet crosses the window at once and the sweep
// files a drift issue per repo for a fleet that is, by versions, current (#1025).
//
// So a member is behind when its stamped engine version is below canon's, or any pack
// it stamps is below that pack's manifest version in canon — read out of CANON over
// the API, never out of the enforcer's own mount, which is itself a member and can be
// behind. The stamped ref is still read for what it honestly is, provenance: whether
// it is a commit on canon's trunk at all, which is the #328 wedge.
//
// Read-only toward every member: the only writes are the enforcer repo's own drift
// issues and their label.

import { labeledIssues, DECLARATION } from '../../fleet-api.mjs';
import { VERSION_SOURCE, versionFromLiteral, isVersion, versionAbove } from '../../../../engine/version.mjs';

const LABEL = 'fleet-drift';
const LABEL_SPEC = { color: 'D93F0B', description: 'Covered member whose Claudinite mount has fallen behind canon' };
const SCHEDULER = '.github/workflows/claudinite-scheduler.yml';

export { LABEL, LABEL_SPEC, SCHEDULER };
export const FRESH = 'fresh';

const driftTitle = (fullName) => `Claudinite mount has fallen behind on ${fullName}`;
const TITLE_RE = /^Claudinite mount has fallen behind on (\S+\/\S+)$/;
// A machine-readable state marker in the body: it lets a later run notice that the
// ROOT CAUSE changed (a repo that was `behind` is now `no-scheduler`) and say so,
// without any cross-run state to keep — the issue carries its own last verdict.
//
// The marker still spells `fleet-freshness`, the retired task that first wrote it, and
// must keep spelling it: every drift issue open in the enforcer right now carries that
// exact string, and a rename would read every one of them as `unrecorded` and comment a
// spurious verdict change on the first run after the merge.
const marker = (state) => `<!-- fleet-freshness: ${state} -->`;
const MARKER_RE = /<!-- fleet-freshness: ([a-z-]+) -->/;

// --- classification (pure) ----------------------------------------------------

// `compare` is what canon's compare endpoint said about `stampedRef → canon default
// branch`, normalized to { status }, or null when the ref is not a commit in canon at
// all. `installed` is the member's own stamp ({ engineVersion, packVersions }) and
// `canon` the same two numbers read out of canon for exactly the packs that stamp
// names. Kept free of I/O so every branch is testable directly.
//
// The precedence is about ROOT CAUSE, not the order the facts arrive in: a member with
// no scheduler is ALSO behind, and reporting "behind" would send the reader chasing a
// symptom of the missing cron.
export function classifyFreshness({ stampedRef, hasScheduler, compare, installed, canon }) {
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
  // A stamp carrying neither number was written before the versioned flows existed,
  // so it cannot be current by construction — an engine that stamps always stamps.
  const packIds = Object.keys(installed.packVersions);
  if (installed.engineVersion === null && packIds.length === 0) {
    return {
      state: 'behind',
      detail: `stamped at ${stampedRef} with no engineVersion and no packVersions — the mount predates the versioned update flows and has not been refreshed by them`,
    };
  }
  // An absent canon number is not a zero: a pack retired from canon has no manifest
  // to be behind, and comparing against a missing entry would report every member
  // that still stamps it.
  const gaps = [];
  if (installed.engineVersion !== null && canon.engineVersion !== null && versionAbove(canon.engineVersion, installed.engineVersion)) {
    gaps.push(`engine v${installed.engineVersion} → v${canon.engineVersion}`);
  }
  for (const id of packIds.sort()) {
    const here = installed.packVersions[id];
    const there = canon.packVersions[id];
    if (isVersion(here) && isVersion(there) && versionAbove(there, here)) {
      gaps.push(`${id} v${here} → v${there}`);
    }
  }
  if (gaps.length) return { state: 'behind', detail: `behind canon by ${gaps.join(', ')}` };
  return {
    state: FRESH,
    detail: `engine v${installed.engineVersion ?? '—'}, ${packIds.length} declared pack(s) at canon versions`,
  };
}

// --- canon's own version numbers ----------------------------------------------

// What a member is measured AGAINST, read out of canon over the API. Not out of this
// repo's checkout: the enforcer runs a vendored mount like any other member, so its
// own engine/version.mjs says what the ENFORCER received, which is a different
// question and can be older.
//
// Both numbers are extracted from source with an anchored line match rather than by
// importing the modules, because the sweep has no canon checkout to import from and
// the two literals are the whole payload. A file whose number cannot be read THROWS —
// the caller turns that into UNKNOWN for the member, which fails the run, and a
// guessed version would silently reclassify the fleet.
//
// Memoized per reader, promise and all: one reader is built per sweep and every
// member consults it, so canon is read once per distinct pack rather than once per
// member per pack.
const ENGINE_VERSION_RE = new RegExp(String.raw`^export const ENGINE_VERSION = '?(${VERSION_SOURCE})'?;$`, 'm');
const PACK_VERSION_RE = new RegExp(String.raw`^ {2}version: '?(${VERSION_SOURCE})'?,$`, 'm');

export function canonVersions(gh, canonRepo) {
  const packs = new Map();
  let engine = null;
  const source = async (path) => {
    const res = await gh(`/repos/${canonRepo}/contents/${encodeURI(path)}`);
    if (res.status === 404) return null;
    if (res.status !== 200 || typeof res.json?.content !== 'string') throw new Error(`${canonRepo}:${path} returned ${res.status}`);
    return Buffer.from(res.json.content, 'base64').toString('utf8');
  };
  return {
    engine() {
      engine ??= (async () => {
        const text = await source('engine/version.mjs');
        const m = text && ENGINE_VERSION_RE.exec(text);
        if (!m) throw new Error(`canon ${canonRepo} has no readable ENGINE_VERSION in engine/version.mjs`);
        return versionFromLiteral(m[1]);
      })();
      return engine;
    },
    // null when canon carries no such pack — a pack the member still stamps but canon
    // has retired. Distinct from a manifest that is there and unreadable, which throws.
    pack(id) {
      if (!packs.has(id)) {
        packs.set(id, (async () => {
          const text = await source(`packs/${id}/pack.mjs`);
          if (text === null) return null;
          const m = PACK_VERSION_RE.exec(text);
          if (!m) throw new Error(`canon ${canonRepo} has no readable version in packs/${id}/pack.mjs`);
          return versionFromLiteral(m[1]);
        })());
      }
      return packs.get(id);
    },
  };
}

// --- the per-member mount probe -----------------------------------------------

// The reads this half adds on top of the declaration the roster walk already made:
// the scheduler workflow's presence, canon's view of the stamped ref, and canon's
// version numbers for the packs this member stamps. It is handed the declaration
// rather than re-reading it, which is the whole point of the merge — the coverage half
// needed the same file, and a member was being read twice.
//
// `canon` is the shared reader built once per sweep, so the per-member cost of the
// version half is bounded by how many packs this member declares that no earlier
// member did — usually none.
//
// Throws on anything indeterminate; the caller turns that into UNKNOWN for this half
// alone. A member whose mount cannot be probed is still one whose declaration was read,
// so the coverage half keeps its verdict.
export async function probeMount(gh, fullName, declaration, { canonRepo, canonBranch, canon }) {
  const stamp = declaration?.claudinite ?? {};
  const stampedRef = stamp.ref ?? null;

  const wf = await gh(`/repos/${fullName}/contents/${SCHEDULER}`);
  if (wf.status !== 200 && wf.status !== 404) throw new Error(`${SCHEDULER} check returned ${wf.status}`);
  const hasScheduler = wf.status === 200;

  const stamped = stamp.packVersions;
  const installed = {
    engineVersion: isVersion(stamp.engineVersion) ? stamp.engineVersion : null,
    packVersions: stamped && typeof stamped === 'object' && !Array.isArray(stamped) ? stamped : {},
  };
  const canonAt = { engineVersion: null, packVersions: {} };

  let compare = null;
  if (stampedRef) {
    // per_page=1 because neither the commit list nor the counts are read — only the
    // status, which is all `ref-not-on-trunk` needs, and a wide-open compare over
    // months of canon is a needlessly large payload.
    const c = await gh(`/repos/${canonRepo}/compare/${stampedRef}...${canonBranch}?per_page=1`);
    if (c.status === 404) compare = null; // not a canon commit — classify(), not an error
    else if (c.status !== 200 || !c.json) throw new Error(`comparing ${stampedRef} against ${canonRepo}@${canonBranch} returned ${c.status}`);
    else compare = { status: c.json.status };

    canonAt.engineVersion = await canon.engine();
    for (const id of Object.keys(installed.packVersions)) {
      const there = await canon.pack(id);
      if (there !== null) canonAt.packVersions[id] = there;
    }
  }
  return { stampedRef, hasScheduler, compare, installed, canon: canonAt };
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
    'The scheduler workflow exists but the self-refresh is not landing. Check the repo\'s',
    'recent `Claudinite scheduler` runs: a disabled workflow (GitHub disables cron on repos',
    'with no activity for 60 days), a failing update task, or a maintenance PR that never',
    'merges all look like this.',
    '',
    'The gap above is read from the stamped `engineVersion`/`packVersions` against canon\'s',
    'own numbers, so it closes only when an update flow actually re-stamps the mount — the',
    'stamped `ref` is provenance and is expected never to move.',
  ],
};

function driftBody(fullName, { state, detail }) {
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
    'This issue is converged by the daily fleet-roster task: it closes',
    'itself `completed` once the repo is fresh again, and `not planned` once the repo leaves the',
    'fleet (excluded, deleted, archived, or no longer covered). A close without either gets',
    'reopened while the repo stays behind.',
  ].join('\n');
}

// --- convergence --------------------------------------------------------------

// One issue per unhealthy member, keyed by a title that names only the repo — so the
// root cause can change without orphaning the thread. Deliberately quieter than the
// coverage half on the way in: an already-open issue gets a comment ONLY when the state
// actually changed, because a sweep over a fleet that is slow to heal would otherwise
// turn every thread into a wall of identical notes. That restraint is what lets this
// half ride the daily cadence rather than the weekly one it used to have.
export async function convergeDrift(gh, home, { unhealthy, healthySet, goneSet, dormantSet = new Set() }) {
  const actions = [];
  const { open: openIssues, closed } = await labeledIssues(gh, home, LABEL);
  const open = new Map(openIssues.map((i) => [i.title, i]));
  const wanted = new Map(unhealthy.map((u) => [u.fullName, u]));

  for (const [fullName, verdict] of wanted) {
    const title = driftTitle(fullName);
    const existing = open.get(title);
    if (existing) {
      const was = MARKER_RE.exec(existing.body ?? '')?.[1];
      if (was === verdict.state) continue; // same story as yesterday — say nothing
      await gh(`/repos/${home}/issues/${existing.number}`, {
        method: 'PATCH', body: { body: driftBody(fullName, verdict) },
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
        method: 'PATCH', body: { state: 'open', body: driftBody(fullName, verdict) },
      });
      await gh(`/repos/${home}/issues/${prior.number}/comments`, {
        method: 'POST', body: { body: `Reopened by the sweep: \`${fullName}\` has fallen behind again (${verdict.state}). ${verdict.detail}.` },
      });
      actions.push(`reopened #${prior.number} (${fullName}: ${verdict.state})`);
    } else {
      const { status, json } = await gh(`/repos/${home}/issues`, {
        method: 'POST',
        body: { title, body: driftBody(fullName, verdict), labels: [LABEL] },
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

// --- the freshness section of the report (pure) -------------------------------

// Enumerates the FULL fleet: every repo lands in exactly one list — fresh (with how
// fresh), unhealthy (with its root cause), dormant, out of scope (with why), unknown —
// plus the two repos this half never measures, named rather than silently absent. A
// report that names only the failures leaves the reader unable to tell "fresh" from
// "fell out of the report". Kept free of I/O so the full-roster property is testable
// directly. `fresh` is `[{ fullName, detail }]`; `outOfScope` entries carry their
// reason inline.
export function renderFreshnessSummary({
  owner, home, canonRepo, canonBranch, fresh, unhealthy, dormant, outOfScope, unknown, actions,
}) {
  const notMeasured = [`\`${home}\` — the enforcer, swept by its own scheduler`];
  if (canonRepo.toLowerCase() !== home.toLowerCase()) notMeasured.push(`\`${canonRepo}\` — canon, with no vendored mount to be stale`);
  return [
    `# Fleet freshness sweep — ${owner} (measured by stamped versions against canon: ${canonRepo}@${canonBranch})`,
    '',
    '| fresh | behind | no scheduler | no stamp | off trunk | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${fresh.length} | ${unhealthy.filter((u) => u.state === 'behind').length} | `
      + `${unhealthy.filter((u) => u.state === 'no-scheduler').length} | `
      + `${unhealthy.filter((u) => u.state === 'no-stamp').length} | `
      + `${unhealthy.filter((u) => u.state === 'ref-not-on-trunk').length} | ${dormant.length} | ${outOfScope.length} | ${unknown.length} |`,
    '',
    unhealthy.length
      ? `**Behind (drift issue open):**\n${unhealthy.map((u) => `- \`${u.fullName}\` — **${u.state}**: ${u.detail}`).join('\n')}`
      : '**Every covered member is up to date 🎉**',
    fresh.length
      ? `**Fresh:**\n${fresh.map((f) => `- \`${f.fullName}\` — ${f.detail}`).join('\n')}`
      : '**Fresh:** none',
    dormant.length ? `**Dormant (self-declared, not measured):** ${dormant.join(', ')}` : '',
    outOfScope.length ? `**Out of scope (not covered members):** ${outOfScope.join(', ')}` : '',
    unknown.length ? `**UNKNOWN (probe errored — fix the token/scope):** ${unknown.join('; ')}` : '',
    `**Not measured:** ${notMeasured.join('; ')}`,
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
  ].filter(Boolean).join('\n');
}
