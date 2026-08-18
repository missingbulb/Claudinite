// The fleet-baseline DISPATCH — the enforcer's manual lever over the whole fleet:
// force every covered member to baseline NOW, instead of waiting for each one's next
// anchor. It dispatches each member's OWN scheduler with `wake: baselining` —
// the same button the owner would press in that repo's Actions tab, pressed across
// the fleet in one run. Nothing is baselined here: each member converges its own
// mount, with its own token, under its own scheduler and its own delivery policy.
// This is a dispatcher, not a maintainer — the fan-out model this pack runs both its
// write-shaped operations on (#749).
//
// IT DOES NOT WAIT. A dispatch queues a run; what the queued run then does is that
// member's own story, told where a member always tells it — its maintenance PR, its
// work items, its own failure escalation. The old workflow's FOLLOW half (watch
// every forced member to a terminal state, render a fleet report) was the reason the
// lever had to be a standalone workflow with a 45-minute sleep in it; giving the
// report up is what lets the lever be an ordinary manual task on the ordinary
// scheduler instead of a managed `.github/` copy only the slow agent path could sync
// (#649). The run's deliverable is the dispatch table: which members were fired,
// which were skipped and why, which refused.
//
// WHY IT EXISTS. Under per-project scheduling every member baselines itself hourly,
// so the fleet needs no push in the ordinary case. The cases it is FOR are the
// un-ordinary ones: a canon change the fleet should pick up now rather than over the
// next day, and the tail of members whose next anchor is hours away. A forced run
// bypasses baselining's precondition (the engine records it as forced), so a member
// with nothing to do converges to a cheap no-op — safe to over-use, only wasteful.
//
// THE TOKEN. FLEET_GITHUB_TOKEN, the same account-spanning PAT the sweeps use, plus
// ONE scope the read-only ones do not need: **Actions: read and write** on the
// owner's repositories. Dispatching another repo's workflow is a write to that
// repo's Actions, and a PAT scoped only for the sweeps gets a 403 here — reported
// per repo and failing the run, because it is a grant to fix once, not a transient.
//
// Dependency-free (global fetch, Node 20+). It writes NOTHING to any member — no
// commit, no issue, no comment; the single side effect per member is one queued
// Actions run.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  makeGh, paged, readDeclaration, isDormant, DECLARATION, SCHEDULER, fireScheduler,
} from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';

// The exact member-side task this lever forces — the id the member's tick resolves
// against its own declared packs (`planWake` in engine/scheduler/queue/tick.mjs);
// named as a constant so the coupling is one line to find, not a string buried in a
// request body.
//
// `update` since Phase 5 (#768): the task this lever used to force no longer exists,
// and a lever that dispatches a task nothing will run reports a successful dispatch
// for a member that then does nothing — the exact "counts dispatches, not outcomes"
// blindness this sweep already has (Sheepdog#172). The task's own NAME is still the
// old vocabulary; renaming it is the fleet-wide update lever's work, not this line's.
export const FORCED_TASK = 'update';

// The `REPOS` parameter, resolved against the owner: a space/whitespace-separated list
// of bare names or full `owner/name`, lowercased, or null for "every member". A bare
// name is qualified with the configured owner, because that is the only owner this
// sweep can reach and typing it twenty times is friction with no upside.
// Space-separated, never comma-separated — the parameter bag splits keys on commas.
export function parseRepoFilter(raw, owner) {
  const names = String(raw ?? '').split(/\s+/).map((s) => s.trim()).filter(Boolean);
  if (!names.length) return null;
  return new Set(names.map((n) => (n.includes('/') ? n : `${owner}/${n}`).toLowerCase()));
}

// Why a repo is out of this dispatch's scope BEFORE its declaration is even read —
// or null when it is in scope. Every branch lands in the report's skipped list,
// never a silent `continue`: the report enumerates the full fleet, and a fleet-wide
// force whose report names only the dispatched members reads as fleet-wide coverage
// when it was not. (Canon is skipped because its baselining self-skips — but the
// enforcer repo is NOT exempt: it is an ordinary member with a mount to converge,
// and leaving it out would make the one repo the owner is looking at the one repo
// that did not move.) Kept free of I/O so every branch is testable directly.
export function classifyScope(r, { canonRepo, exclude, filter }) {
  const fullName = r.full_name.toLowerCase();
  if (fullName === canonRepo.toLowerCase()) {
    return { state: 'canon', detail: 'canon has no vendored mount — forcing it would queue a run whose only outcome is its own self-skip' };
  }
  if (r.archived || r.fork) return { state: 'out-of-scope', detail: r.archived ? 'archived' : 'a fork' };
  if (exclude.has(fullName)) return { state: 'excluded', detail: "on the sheepdog config's exclude list" };
  if (filter && !filter.has(fullName)) return { state: 'filtered-out', detail: "not in this run's REPOS filter" };
  return null;
}

// --- main ---------------------------------------------------------------------

export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read, and Actions READ AND WRITE) — '
      + 'the default GITHUB_TOKEN sees only this repo and cannot dispatch another repo\'s workflow.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const dryRun = String(process.env.FLEET_BASELINE_DRY_RUN ?? '').toLowerCase() === 'true';
  const includeDormant = String(process.env.FLEET_BASELINE_INCLUDE_DORMANT ?? '').toLowerCase() === 'true';

  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, exclude, canonRepo } = parseSheepdogConfig(cfg, home);
  const filter = parseRepoFilter(process.env.FLEET_BASELINE_REPOS, owner);

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope`);
  }

  const fired = []; const skipped = []; const failed = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    // Out of scope before the declaration is read — canon, archived, a fork, excluded,
    // or filtered out. classifyScope says why, and each lands in the skipped list: no
    // repo leaves this report silently, whatever its state.
    const scope = classifyScope(r, { canonRepo, exclude, filter });
    if (scope) { skipped.push({ fullName, ...scope }); continue; }

    let decl;
    try {
      decl = await readDeclaration(gh, r.full_name);
    } catch (e) {
      // Unreadable is not uncovered: a repo whose declaration could not be read might be
      // a member that needed this run, so it is a FAILURE to escalate, never a silent skip.
      failed.push({ fullName, state: 'error', detail: `could not read ${DECLARATION}: ${e.message}` });
      continue;
    }
    if (decl === null) {
      skipped.push({ fullName, state: 'uncovered', detail: `no tracked ${DECLARATION} — adoption is the census's business, and there is nothing there to baseline` });
      continue;
    }
    if (isDormant(decl) && !includeDormant) {
      // A dormant member stopped its own scheduler; a forced dispatch on it either does
      // nothing (the run stops before evaluating anything) or wakes a repo that asked to
      // sleep. Reported, not silently dropped, so a fleet-wide force is never mistaken
      // for fleet-wide coverage.
      skipped.push({ fullName, state: 'dormant', detail: 'self-declared dormant — pass INCLUDE_DORMANT=true to force it anyway' });
      continue;
    }

    if (dryRun) {
      fired.push({ fullName, state: 'would-fire', detail: `would dispatch ${SCHEDULER}@${r.default_branch} to wake ${FORCED_TASK}` });
      continue;
    }
    const verdict = await fireScheduler(gh, r.full_name, r.default_branch, FORCED_TASK);
    if (verdict.state !== 'fired') { failed.push({ fullName, ...verdict }); continue; }
    fired.push({ fullName, ...verdict });
  }

  const runsUrl = (n) => `https://github.com/${n}/actions/workflows/${SCHEDULER}`;
  const summary = [
    `# Fleet baseline — ${owner}${dryRun ? ' (DRY RUN — nothing was dispatched)' : ''}`,
    '',
    `Asked each covered member's own \`${SCHEDULER}\` to wake its \`${FORCED_TASK}\` item and run it now.`,
    filter ? `Filtered to: ${[...filter].join(', ')}` : '',
    '',
    `| ${dryRun ? 'would fire' : 'fired'} | skipped | failed |`,
    '| --- | --- | --- |',
    `| ${fired.length} | ${skipped.length} | ${failed.length} |`,
    '',
    fired.length
      ? `**${dryRun ? 'Would fire' : 'Fired'}:**\n${fired.map((f) => `- [\`${f.fullName}\`](${runsUrl(f.fullName)})`).join('\n')}`
      : '**No member was dispatched** — check the filter, or whether anything under this owner is covered.',
    skipped.length ? `**Skipped:**\n${skipped.map((s) => `- \`${s.fullName}\` — **${s.state}**: ${s.detail}`).join('\n')}` : '',
    failed.length ? `**Failed:**\n${failed.map((f) => `- \`${f.fullName}\` — **${f.state}**: ${f.detail}`).join('\n')}` : '',
    '',
    // The dispatch API returns 204 with no body, so there is no run id to link here:
    // each member's own workflow page is the honest destination.
    '_A dispatch only queues a run. Each member reports its own baselining the way it_',
    '_always does — a maintenance PR, or a failure issue in that repo._',
  ].filter(Boolean).join('\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  // What fails the run: a dispatch that never landed is a grant or an adoption to fix,
  // and reporting it in a green run is how it goes unnoticed. Everything that DID fire
  // is already reported above — the throw ends the run, it does not withdraw the report.
  if (failed.length) {
    throw new Error(`${failed.length} member(s) could not be dispatched (${failed.map((f) => `${f.fullName}: ${f.state}`).join('; ')}) — `
      + 'the rest are reported above, and this run fails so the cause is escalated');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-baseline failed: ${e.message}`); process.exit(1); });
}
