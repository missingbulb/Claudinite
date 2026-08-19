// The COVERAGE half of the fleet-roster sweep: the `fleet-adoption` issue family and
// the coverage section of the run report.
//
// It holds no enumeration and no classification — the roster is built once, for both
// halves, by its sibling check-fleet-roster.mjs, and this module is handed the finished
// buckets. What lives here is everything that is specific to the coverage QUESTION:
// what an adoption issue says, when one opens, closes or reopens, and how the coverage
// roster reads. Its counterpart is drift-issues.mjs, which owns the same three things
// for the freshness question; the two never import each other.
//
// Read-only toward every repo it names: the only writes are the enforcer repo's own
// adoption issues and their label. An uncovered repo is told about through an issue in
// the enforcer and in no other way — nothing here or downstream adopts it, because
// adoption is the one thing a repo cannot do for itself (the scheduler that would run
// it is what adoption installs).

import { labeledIssues } from '../../fleet-api.mjs';

const LABEL = 'fleet-adoption';
const LABEL_SPEC = { color: '1D76DB', description: 'Repo awaiting adoption into the Claudinite fleet' };
const adoptionTitle = (fullName) => `Adopt ${fullName} into the Claudinite fleet`;
const TITLE_RE = /^Adopt (\S+\/\S+) into the Claudinite fleet$/;

export { LABEL, LABEL_SPEC };

function adoptionBody(fullName) {
  return [
    `\`${fullName}\` exists under this account but does not mount Claudinite (no tracked`,
    '`.claudinite/` signal on its default branch) and is not on the exclude list.',
    '',
    'Pick one:',
    '',
    '- **Adopt it** — run the adoption in a session on that repo (ask for "adopt Claudinite";',
    '  the `adopt-claudinite` skill drives `bootstrap.md`). This is a human-initiated step by',
    '  design: adoption is the one thing a repo cannot do for itself, because the scheduler',
    '  that would run it is what adoption installs. Nothing will do it on your behalf.',
    `- **Keep it out** — add \`${fullName}\` to the claudinite-fleet-sheepdog pack entry's \`config.exclude\` in this`,
    '  (claudinite-fleet-sheepdog) repo\'s `.claudinite-checks.json`, with a reason.',
    '',
    'This issue is converged by the daily fleet-roster task: it closes itself once the',
    'repo is covered (`completed`) or opted out (`not planned`), and a close without either',
    'gets reopened while the repo stays uncovered.',
  ].join('\n');
}

// --- adoption-issue convergence ----------------------------------------------

export async function convergeAdoption(gh, home, { uncovered, coveredSet, optedOutSet }) {
  const actions = [];
  const { open: openIssues, closed } = await labeledIssues(gh, home, LABEL);
  const open = new Map(openIssues.map((i) => [i.title, i]));

  for (const fullName of uncovered) {
    const title = adoptionTitle(fullName);
    if (open.has(title)) continue;
    const prior = closed.filter((i) => i.title === title)
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];
    if (prior && prior.state_reason === 'not_planned') continue; // owner declined; opt-out is the standing fix
    if (prior) {
      await gh(`/repos/${home}/issues/${prior.number}`, { method: 'PATCH', body: { state: 'open' } });
      await gh(`/repos/${home}/issues/${prior.number}/comments`, {
        method: 'POST', body: { body: `Reopened by the roster sweep: \`${fullName}\` is still uncovered.` },
      });
      actions.push(`reopened #${prior.number} (${fullName})`);
    } else {
      const { status, json } = await gh(`/repos/${home}/issues`, {
        method: 'POST',
        body: { title, body: adoptionBody(fullName), labels: [LABEL] },
      });
      if (status !== 201) throw new Error(`creating adoption issue for ${fullName} returned ${status}`);
      actions.push(`opened #${json.number} (${fullName})`);
    }
  }

  for (const [title, issue] of open) {
    const m = TITLE_RE.exec(title);
    if (!m) continue;
    const fullName = m[1].toLowerCase();
    let reason = null; let note = null;
    if (coveredSet.has(fullName)) {
      reason = 'completed'; note = 'now mounts Claudinite — covered';
    } else if (optedOutSet.has(fullName)) {
      reason = 'not_planned'; note = "on the exclude list (the claudinite-fleet-sheepdog pack entry's config.exclude)";
    } else if (!uncovered.includes(fullName)) {
      reason = 'not_planned'; note = 'no longer an adoption candidate (deleted, archived, transferred, or now a fork)';
    }
    if (!reason) continue;
    await gh(`/repos/${home}/issues/${issue.number}/comments`, {
      method: 'POST', body: { body: `Closed by the roster sweep: \`${m[1]}\` ${note}.` },
    });
    await gh(`/repos/${home}/issues/${issue.number}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: reason },
    });
    actions.push(`closed #${issue.number} (${m[1]}: ${note})`);
  }
  return actions;
}

// --- the coverage section of the report (pure) --------------------------------

// Enumerates the FULL fleet: every repo lands in exactly one list below, whatever its
// state — covered, dormant, uncovered, opted out, skipped, unknown — plus the enforcer
// itself, which is not censused but still named. A roster that names only the
// exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the
// report". Kept free of I/O so the full-roster property is testable directly.
export function renderCoverageSummary({ owner, home, covered, dormant, uncovered, optedOut, skipped, unknown, actions }) {
  return [
    `# Fleet coverage census — ${owner}`,
    '',
    '| covered | dormant | uncovered | opted out | skipped (fork/archived) | unknown |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${covered.length} | ${dormant.length} | ${uncovered.length} | ${optedOut.length} | ${skipped.length} | ${unknown.length} |`,
    '',
    covered.length ? `**Covered:** ${covered.join(', ')}` : '**Covered:** none',
    dormant.length ? `**Covered but dormant (self-declared, upkeep stopped):** ${dormant.join(', ')}` : '',
    uncovered.length ? `**Uncovered (adoption issue open):** ${uncovered.join(', ')}` : '**Uncovered:** none 🎉',
    optedOut.length ? `**Opted out (config.exclude):** ${optedOut.join(', ')}` : '',
    skipped.length ? `**Skipped:** ${skipped.join(', ')}` : '',
    unknown.length ? `**UNKNOWN (declaration read errored — fix the token/scope):** ${unknown.join('; ')}` : '',
    `**Not censused:** ${home} — the enforcer itself`,
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
  ].filter(Boolean).join('\n');
}
