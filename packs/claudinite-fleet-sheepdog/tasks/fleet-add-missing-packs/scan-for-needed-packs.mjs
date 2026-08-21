// The SCAN half of fleet-add-missing-packs — the cross-repo question "what might a
// member want that it does not declare?".
//
// It is one of the task's two first stages, reached when `scan_for_needed_packs=true`
// (params.mjs); the other is force-add-packs.mjs, where the answer was decided by
// hand instead of fingerprinted. Both converge work-list issues IN THE MEMBER
// (protocol.mjs) and fire that member's own scheduler — the fan-out model (#749):
// the enforcer dispatches, the member executes, and the agent that confirms a
// suspicion is the member's own, with the repo checked out (which settles exactly
// the content-reading fingerprints this REST sweep must defer).
//
// The census asks "is this repo a MEMBER". Freshness asks "is that membership still
// MEANING anything". Both take the member's declared pack set as given. Neither ever
// asks whether that set still MATCHES the repo — and nothing else does either: a
// pack's `detect` fingerprint is consulted once, at bootstrap's `--init`, and never
// again. Baselining backfills the seeded packs and each declared pack's `requires`
// closure; it does not re-fingerprint. So a repo that grows into a pack after
// adoption — adds a package.json, a firebase.json, a Chrome manifest — is never told
// the pack exists, and the owner has to already know what to ask for.
//
// It is a SUSPICION, and the issue says so. The `pack-declaration` conformance check
// was deliberately retired (engine/checks/README.md) because declaring a pack is the
// project's call; a fit finding is the same claim in a weaker place — a
// recommendation the member's agent (then a reviewer) acts on, never an assertion
// the repo is wrong. An owner (or the member's agent) that closes the suspected
// issue `not planned` has given a standing answer: the scan stops suggesting to that
// repo rather than reopening weekly.
//
// Dependency-free (global fetch, Node 20+); read-only toward every member's TREE,
// and writes only the work-list issue + label in members with findings.

import { paged, readDeclaration, isDormant, ensureLabel, labeledIssues } from '../../fleet-api.mjs';
import { undeclaredFits } from './fingerprint-fit.mjs';
import { fetchTree, makeRemoteEvaluator } from './remote-context.mjs';
import { LABEL, MARK, SUSPECTED_TITLE, REQUESTED_TITLE } from './protocol.mjs';
import { ensureMark, markedBody, remarkWorkList, otherOpenWorkList } from './mark-work-list.mjs';
import { closeSatisfiedRequest } from './force-add-packs.mjs';

// --- the issue body (pure) ----------------------------------------------------

// The issue is the durable record AND the member agent's work list, so it carries
// the evidence rather than a bare verdict: which packs, what each one is for, and
// the standing reminder that a fingerprint suspects rather than proves.
export function suspectedBody({ fits, undecided, packsById = new Map() }) {
  const lines = [
    'This repo carries file shapes that fingerprint packs its `.claudinite-checks.json`',
    'does not declare. A fingerprint only **suspects** a pack is wanted — declaring one is',
    "this project's call, which is why this is an issue and not a failing check.",
    '',
    '## Suspected packs',
    '',
  ];
  for (const id of fits) {
    const belongs = packsById.get(id)?.ruleRoutingGuidance?.belongs;
    lines.push(`- **\`${id}\`**${belongs ? ` — ${belongs}` : ''}`);
  }
  lines.push(
    '',
    'This repo\'s own **adopt-requested-packs** task acts on this list: its agent confirms',
    'each suspicion against the checkout, adopts what survives through the adopt-pack skill',
    '(one reviewed PR on this repo), and declines the rest with a reason here. To decline',
    'everything for good, close this issue `not planned` — that is a standing answer the',
    'weekly fleet scan honours rather than re-suggesting.',
  );
  if (undecided.length) {
    lines.push(
      '',
      '## Not decided from outside',
      '',
      'These fingerprints read file **contents**, which the fleet\'s REST sweep cannot settle',
      'within its read budget. The agent working this issue has the repo checked out and can',
      'answer them exactly — `localFits` in the enforcer-side task\'s `fingerprint-fit.mjs`:',
      '',
      ...undecided.map((u) => `- \`${u.id}\` — ${u.why}`),
    );
  }
  lines.push(
    '',
    'Converged weekly by the fleet\'s add-missing-packs scan: it closes this `completed` once',
    'the declaration carries the packs (or the shape stops suggesting them).',
  );
  return lines.join('\n');
}

// --- per-member issue convergence ----------------------------------------------

// Converge one member's SUSPECTED issue against this sweep's finding. Returns
// `{ action, openWork }`: `action` is a one-line report entry or null, `openWork` is
// whether the member ends the sweep with an open suspected work list (the signal the
// worker fires its scheduler on).
export async function convergeSuspectedIssue(gh, fullName, { fits, body }) {
  const { open, closed } = await labeledIssues(gh, fullName, LABEL);
  const existing = open.find((i) => i.title === SUSPECTED_TITLE);

  if (!fits.length) {
    if (!existing) return { action: null, openWork: false };
    await gh(`/repos/${fullName}/issues/${existing.number}/comments`, {
      method: 'POST', body: { body: 'Closed by the fleet\'s add-missing-packs scan: this repo now declares every pack its shape fingerprints.' },
    });
    await gh(`/repos/${fullName}/issues/${existing.number}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: 'completed' },
    });
    return { action: `closed #${existing.number} (${fullName}: fitted)`, openWork: false };
  }

  if (existing) {
    // The suspected set can change between runs. Rewrite the body rather than
    // commenting: the issue is a work list, and a work list that has to be
    // reassembled from a comment thread is one nobody reads to the bottom of. The
    // member's own machine block survives the rewrite, and a body that really
    // changed clears the status — the re-ask (mark-work-list.mjs).
    const written = await remarkWorkList(gh, fullName, existing, markedBody(body, existing));
    return { action: written ? `updated #${existing.number} (${fullName})` : null, openWork: true };
  }

  // A deliberate `not planned` close is a standing decline for this repo — reopening
  // it every week would be nagging about a decision already made.
  const prior = closed.filter((i) => i.title === SUSPECTED_TITLE)
    .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];
  if (prior && prior.state_reason === 'not_planned') return { action: null, openWork: false };

  await ensureLabel(gh, fullName, LABEL, {
    color: '0E8A16',
    description: 'The fleet asks this repo to declare packs — adopted by the adopt-requested-packs task',
  });
  await ensureMark(gh, fullName);
  const { status, json } = await gh(`/repos/${fullName}/issues`, {
    method: 'POST',
    body: {
      title: SUSPECTED_TITLE,
      // Behind the member's other open work list, where it has one: two lists are
      // two items of one task, and nothing else serializes them.
      body: markedBody(body, null, { blockedBy: otherOpenWorkList(open, SUSPECTED_TITLE) }),
      labels: [LABEL, MARK],
    },
  });
  if (status !== 201) throw new Error(`creating the suspected-packs issue in ${fullName} returned ${status}`);
  return { action: `opened #${json.number} (${fullName})`, openWork: true };
}

// --- the run summary (pure) ---------------------------------------------------

// Full-roster reporting, the same property every claudinite-fleet-sheepdog sweep carries: every repo
// under the owner lands under exactly one state. "Fitted" (nothing suspected) is
// named as loudly as "has fits", because a reader cannot otherwise tell a member
// that came back clean from one that fell out of the report.
export function renderFitSummary({
  owner, home, canonRepo, packCount, findings, fitted, dormant, outOfScope, unknown, actions, fired,
  repoFilter = null,
}) {
  const undecidedCount = findings.reduce((n, f) => n + f.undecided.length, 0);
  return [
    `# Fleet pack-fit scan — ${owner}`,
    '',
    // A SCOPED scan measured part of the fleet, and every count below is a count of
    // that part. Saying so first is what keeps "nothing suspected" from reading as a
    // statement about the fleet when it was a statement about four repos.
    repoFilter ? `Scoped to **${repoFilter.length} named repo(s)**: ${repoFilter.join(', ')}` : '',
    // The denominator, stated. "Nothing suspected" means nothing against THIS corpus,
    // and a corpus that quietly shrank (the enforcer's own mount instead of canon, a
    // half-fetched clone) produces a clean report for the wrong reason.
    `Fingerprinted against **${packCount} canon pack(s)** from \`${canonRepo}\`.`,
    '',
    '| members with fits | fitted (nothing suspected) | schedulers fired | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${findings.length} | ${fitted.length} | ${fired.length} | ${dormant.length} | ${outOfScope.length} | ${unknown.length} |`,
    '',
    findings.length
      ? `**Undeclared fits (work list placed in each repo):**\n${findings.map((f) => `- \`${f.repo}\` → ${f.fits.join(', ')}`).join('\n')}`
      : '**Undeclared fits:** none — every member declares what its shape suspects 🎉',
    fitted.length ? `**Fitted:** ${fitted.join(', ')}` : '',
    dormant.length ? `**Dormant (not swept — upkeep stopped on purpose):** ${dormant.join(', ')}` : '',
    outOfScope.length ? `**Out of scope:** ${outOfScope.join(', ')}` : '',
    undecidedCount
      ? `**Undecided fingerprints (content-reading, deferred to each member's own agent):** ${undecidedCount} across the fleet`
      : '',
    unknown.length ? `**UNKNOWN (could not be swept — fix the token/scope):** ${unknown.join('; ')}` : '',
    `**Not swept:** ${home} — the enforcer itself`,
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
  ].filter(Boolean).join('\n');
}

// --- the sweep ---------------------------------------------------------------

// The scan stage, with the corpus and config already in hand — worker.mjs owns both.
// `repos` is null for the fleet-wide scan (`repos=all-covered-members`) or a list of
// qualified `owner/name` when the run was scoped; a scoped scan measures what it was
// asked to and asserts nothing about the rest.
//
// Returns `{ findings, unknown, toFire, actions, … }`; `toFire` is the members that
// end the sweep with an open work list — suspected from this scan, or a REQUESTED
// issue still outstanding from an earlier force (re-firing is the retry loop for a
// member whose earlier adoption run died). It does not throw on an unswept member:
// the worker decides what a partial picture means for the whole run.
export async function runScan({ gh, home, owner, canonRepo, packs, repos = null }) {
  const packsById = new Map(packs.map((p) => [p.id, p]));
  const wanted = repos ? new Set(repos.map((n) => n.toLowerCase())) : null;

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope; `
      + 'refusing to run a sweep that would read an empty fleet as a converged one');
  }

  const findings = []; const fitted = []; const dormant = []; const outOfScope = []; const unknown = [];
  const actions = []; const toFire = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    if (fullName === home.toLowerCase()) continue; // the enforcer itself — named in the summary, not swept
    if (wanted && !wanted.has(fullName)) continue; // out of this run's scope; the filter is the report's subject line
    if (r.archived || r.fork) { outOfScope.push(`${r.full_name} (${r.archived ? 'archived' : 'fork'})`); continue; }

    let decl;
    try {
      decl = await readDeclaration(gh, r.full_name);
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
      continue;
    }
    // Coverage is the census's question, not this sweep's: an uncovered repo has no
    // declaration to add a pack to, and its adoption issue is already open elsewhere.
    if (decl === null) { outOfScope.push(`${r.full_name} (uncovered — the census's question)`); continue; }
    // A dormant member stopped its own upkeep on purpose. Recommending packs to it
    // would be work it has declared it is not doing.
    if (isDormant(decl)) { dormant.push(fullName); continue; }

    let result;
    try {
      const { tracked, truncated } = await fetchTree(gh, r.full_name, r.default_branch);
      const evaluate = makeRemoteEvaluator(gh, r.full_name, r.default_branch, { tracked, truncated });
      result = await undeclaredFits({ packs, declared: decl.packs ?? [], evaluate });
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
      continue;
    }

    let requestOutstanding = false;
    try {
      const body = suspectedBody({ ...result, packsById });
      const { action, openWork } = await convergeSuspectedIssue(gh, r.full_name, { fits: result.fits, body });
      if (action) actions.push(action);
      // The satisfied-request close rides the same per-member visit: completion is a
      // fact about the member's declaration, whichever run opened the request.
      const { open } = await labeledIssues(gh, r.full_name, LABEL);
      const closed = await closeSatisfiedRequest(gh, r.full_name, { decl, open });
      if (closed) actions.push(closed);
      requestOutstanding = !closed && open.some((i) => i.title === REQUESTED_TITLE);
      if (openWork || requestOutstanding) {
        toFire.push({ fullName: r.full_name, defaultBranch: r.default_branch });
      }
    } catch (e) {
      unknown.push(`${r.full_name} — work-list convergence failed: ${e.message}`);
      continue;
    }

    if (result.fits.length) findings.push({ repo: fullName, ...result });
    else fitted.push(fullName);
  }

  return {
    findings, unknown, toFire, actions, fitted, dormant, outOfScope,
    summaryArgs: { owner, home, canonRepo, packCount: packs.length, findings, fitted, dormant, outOfScope, unknown, actions, repoFilter: repos },
  };
}
