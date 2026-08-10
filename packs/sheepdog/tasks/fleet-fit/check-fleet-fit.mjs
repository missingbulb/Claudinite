#!/usr/bin/env node
// The sheepdog pack's fleet-FIT sweep — the fourth cross-repo question.
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
// This sweep is that re-ask, from the outside, weekly: for every covered member, run
// each canon pack's fingerprint against the member's tree over REST, and converge one
// `fleet-fit` ISSUE per member listing the packs its shape suspects and its
// declaration does not carry.
//
// It is a SUSPICION, and the issue says so. The `pack-declaration` conformance check
// was deliberately retired (engine/checks/README.md) because declaring a pack is the
// project's call; a fit finding is the same claim in a weaker place — a
// recommendation an owner (or the agent stage) acts on, never an assertion the repo
// is wrong. The agent stage that follows this sweep is what turns an accepted
// suspicion into a reviewed PR on the member, via the adopt-pack skill.
//
// The whole feature lives in this task folder — the fingerprint half
// (fingerprint-fit.mjs, pack-agnostic and fleet-blind) beside the aggregation half
// (this file), because nothing outside this task uses either.
//
// Dependency-free (global fetch, Node 20+); read-only toward every member, and writes
// only the fit issues + label in the home repo.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, paged, readDeclaration, isDormant, ensureLabel, labeledIssues } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';
import { undeclaredFits } from './fingerprint-fit.mjs';
import { fetchTree, makeRemoteEvaluator } from './remote-context.mjs';
import { loadCanonPacks } from './canon-packs.mjs';

const LABEL = 'fleet-fit';
const fitTitle = (fullName) => `Pack fit: ${fullName} may want packs it does not declare`;
const TITLE_RE = /^Pack fit: (\S+\/\S+) may want packs it does not declare$/;

// --- the issue body (pure) ----------------------------------------------------

// The issue is the durable record AND the agent stage's work list, so it carries the
// evidence rather than a bare verdict: which packs, what each one is for, and the
// standing reminder that a fingerprint suspects rather than proves.
export function fitBody(fullName, { fits, undecided, packsById = new Map() }) {
  const lines = [
    `\`${fullName}\` carries file shapes that fingerprint packs its \`.claudinite-checks.json\``,
    'does not declare. A fingerprint only **suspects** a pack is wanted — declaring one is the',
    "project's call, which is why this is an issue and not a failing check.",
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
    'To adopt any of them, run the **adopt-pack** skill against that repo: it declares the',
    "pack, runs the pack's adoption interview, re-vendors the mount, scaffolds what the pack",
    'now demands, and lands one reviewed PR. To decline one, nothing is needed here —',
    'but the suspicion will recur weekly while the shape does, so record the decision on this',
    'issue and close it `not planned` if the answer is standing.',
  );
  if (undecided.length) {
    lines.push(
      '',
      '## Not decided from outside',
      '',
      'These fingerprints read file **contents** rather than paths, which a REST sweep cannot',
      'settle within its read budget. A session with the repo checked out can answer them',
      'exactly — `localFits` in this task\'s `fingerprint-fit.mjs` (under the enforcer\'s mount,',
      '`.claudinite/shared/packs/sheepdog/tasks/fleet-fit/`):',
      '',
      ...undecided.map((u) => `- \`${u.id}\` — ${u.why}`),
    );
  }
  lines.push(
    '',
    'Converged weekly by the fleet-fit task: it closes `completed` once the repo declares',
    'the packs, and `not planned` once the repo leaves the fleet.',
  );
  return lines.join('\n');
}

// --- issue convergence --------------------------------------------------------

// Open while a member has undeclared fits, closed once it declares them, closed
// `not planned` once it leaves the fleet — the same lifecycle the census and the
// freshness sweep run, because a standing recommendation and a standing finding
// converge identically. The one difference is the deliberate close: an owner who
// closes a fit issue `not planned` has DECLINED these packs, and reopening it every
// week would be nagging about a decision already made.
async function convergeIssues(gh, home, { findings, inFleet, packsById }) {
  const actions = [];
  const { open: openIssues, closed } = await labeledIssues(gh, home, LABEL);
  const open = new Map(openIssues.map((i) => [i.title, i]));
  const byRepo = new Map(findings.map((f) => [f.repo, f]));

  for (const finding of findings) {
    const title = fitTitle(finding.repo);
    const body = fitBody(finding.repo, { ...finding, packsById });
    const existing = open.get(title);
    if (existing) {
      // The set of suspected packs can grow between runs. Rewrite the body rather
      // than commenting: the issue is a work list, and a work list that has to be
      // reassembled from a comment thread is one nobody reads to the bottom of.
      if (existing.body !== body) {
        await gh(`/repos/${home}/issues/${existing.number}`, { method: 'PATCH', body: { body } });
        actions.push(`updated #${existing.number} (${finding.repo})`);
      }
      continue;
    }
    const prior = closed.filter((i) => i.title === title)
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];
    if (prior && prior.state_reason === 'not_planned') continue; // declined — a standing answer
    const { status, json } = await gh(`/repos/${home}/issues`, {
      method: 'POST', body: { title, body, labels: [LABEL] },
    });
    if (status !== 201) throw new Error(`creating fit issue for ${finding.repo} returned ${status}`);
    actions.push(`opened #${json.number} (${finding.repo})`);
  }

  for (const [title, issue] of open) {
    const m = TITLE_RE.exec(title);
    if (!m) continue;
    const repo = m[1].toLowerCase();
    if (byRepo.has(repo)) continue;
    const left = !inFleet.has(repo);
    const note = left
      ? 'is no longer a covered member of the fleet'
      : 'now declares every pack its shape fingerprints';
    await gh(`/repos/${home}/issues/${issue.number}/comments`, {
      method: 'POST', body: { body: `Closed by the fit sweep: \`${m[1]}\` ${note}.` },
    });
    await gh(`/repos/${home}/issues/${issue.number}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: left ? 'not_planned' : 'completed' },
    });
    actions.push(`closed #${issue.number} (${m[1]}: ${note})`);
  }
  return actions;
}

// --- the run summary (pure) ---------------------------------------------------

// Full-roster reporting, the same property the other three sweeps carry: every repo
// under the owner lands under exactly one state. "Fitted" (nothing suspected) is
// named as loudly as "has fits", because a reader cannot otherwise tell a member that
// came back clean from one that fell out of the report.
export function renderFitSummary({
  owner, home, canonRepo, packCount, findings, fitted, dormant, outOfScope, unknown, actions,
}) {
  const undecidedCount = findings.reduce((n, f) => n + f.undecided.length, 0);
  return [
    `# Fleet pack-fit sweep — ${owner}`,
    '',
    // The denominator, stated. "Nothing suspected" means nothing against THIS corpus,
    // and a corpus that quietly shrank (the enforcer's own mount instead of canon, a
    // half-fetched clone) produces a clean report for the wrong reason. Naming what
    // was measured against is what makes that visible in the report itself.
    `Fingerprinted against **${packCount} canon pack(s)** from \`${canonRepo}\`.`,
    '',
    '| members with fits | fitted (nothing suspected) | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- |',
    `| ${findings.length} | ${fitted.length} | ${dormant.length} | ${outOfScope.length} | ${unknown.length} |`,
    '',
    findings.length
      ? `**Undeclared fits:**\n${findings.map((f) => `- \`${f.repo}\` → ${f.fits.join(', ')}`).join('\n')}`
      : '**Undeclared fits:** none — every member declares what its shape suspects 🎉',
    fitted.length ? `**Fitted:** ${fitted.join(', ')}` : '',
    dormant.length ? `**Dormant (not swept — upkeep stopped on purpose):** ${dormant.join(', ')}` : '',
    outOfScope.length ? `**Out of scope:** ${outOfScope.join(', ')}` : '',
    undecidedCount
      ? `**Undecided fingerprints (content-reading, deferred to a checkout):** ${undecidedCount} across the fleet`
      : '',
    unknown.length ? `**UNKNOWN (could not be swept — fix the token/scope):** ${unknown.join('; ')}` : '',
    `**Not swept:** ${home} — the enforcer itself`,
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
  ].filter(Boolean).join('\n');
}

// --- main --------------------------------------------------------------------

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

  const cfgRes = await gh(`/repos/${home}/contents/.claudinite-checks.json`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable .claudinite-checks.json (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable .claudinite-checks.json on ${home}: ${e.message}`);
  }
  const { owner, canonRepo } = parseSheepdogConfig(cfg, home);

  // The fingerprints come from CANON, not from this enforcer's own mount — the mount
  // carries only the packs this repo declares, so fingerprinting the fleet against it
  // would silently test every member against a handful of packs and report the whole
  // fleet as fitted. See canon-packs.mjs.
  const { packs, dispose } = await loadCanonPacks({ canonRepo, token });
  try {
    await sweepFleet({ gh, home, owner, canonRepo, packs });
  } finally {
    dispose();
  }
}

// The sweep proper, with the corpus already in hand. Split out so the scratch clone
// has exactly one disposal site whatever happens inside — including the deliberate
// throw at the foot, which must still fail the run.
async function sweepFleet({ gh, home, owner, canonRepo, packs }) {
  const packsById = new Map(packs.map((p) => [p.id, p]));

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope; `
      + 'refusing to run a sweep that would close every fit issue as resolved');
  }

  const findings = []; const fitted = []; const dormant = []; const outOfScope = []; const unknown = [];
  const inFleet = new Set();
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    if (fullName === home.toLowerCase()) continue; // the enforcer itself — named in the summary, not swept
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
    inFleet.add(fullName);

    let result;
    try {
      const { tracked, truncated } = await fetchTree(gh, r.full_name, r.default_branch);
      const evaluate = makeRemoteEvaluator(gh, r.full_name, r.default_branch, { tracked, truncated });
      result = await undeclaredFits({ packs, declared: decl.packs ?? [], evaluate });
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
      continue;
    }
    if (result.fits.length) findings.push({ repo: fullName, ...result });
    else fitted.push(fullName);
  }

  await ensureLabel(gh, home, LABEL, { color: '0E8A16', description: 'Member carries file shapes fingerprinting packs it does not declare' });
  const actions = await convergeIssues(gh, home, { findings, inFleet, packsById });

  const summary = renderFitSummary({
    owner, home, canonRepo, packCount: packs.length, findings, fitted, dormant, outOfScope, unknown, actions,
  });
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  if (unknown.length) {
    throw new Error(`${unknown.length} repo(s) could not be swept — unknown is not fitted, `
      + 'no fit issue was opened or closed for them, and this run fails so the cause is escalated');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-fit sweep failed: ${e.message}`); process.exit(1); });
}
