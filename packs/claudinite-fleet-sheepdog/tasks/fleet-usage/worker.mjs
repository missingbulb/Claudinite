// The fleet-usage code-work entry point — the script the executor runs as code-work,
// `node worker.mjs` (cwd = this task dir, bounded by code_work_timeout).
//
// It holds NO aggregation logic. The sweep is `aggregate-fleet-usage.mjs`, its
// SIBLING in this task folder — nothing outside this task uses it, so that is where
// it lives; this worker invokes it and DELIVERS its result. Same shape as the census
// and freshness workers, deliberately, with one difference: those two converge
// issues, and this one writes a file, so it carries the delivery step they don't.
//
// Two tokens, two jobs, and they are not interchangeable: the sweep READS the fleet
// over FLEET_GITHUB_TOKEN (the account-spanning PAT — the Action token sees only
// this repo), while the delivery WRITES this repo's own PR over the ordinary Action
// GITHUB_TOKEN.
//
// Failure is the escalation path. The sweep THROWS when its config or token is
// unusable, or when enumeration comes back empty; this worker turns that into a
// non-zero exit, and the executor treats a non-zero code-work subprocess as a failed
// task — it converges the item to `needs-human`
// (engine/scheduler/queue/executor.mjs) instead of handing off to any agent.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fleetWorkerFailed } from '../../fleet-api.mjs';
import { deliverGenerated, baseTip, readAt, remoteUrl } from '../../../../engine/scheduler/deliver-generated.mjs';
import { main as sweep, inactiveToday, renderFleetFile, FLEET_USAGE_PATH } from './aggregate-fleet-usage.mjs';

const PR_BRANCH_PREFIX = 'claudinite/fleet-usage';
const item = process.env.CLAUDINITE_ITEM || '';
const log = (s) => console.log(`fleet-usage${item ? ` [#${item}]` : ''}: ${s}`);

// `generatedAt` changes every day, so comparing the whole file would open a PR daily
// even on a fleet where nothing moved. Compare everything else: an unchanged fleet
// re-stamps nothing and opens nothing.
export function unchanged(priorText, nextText) {
  if (priorText === null) return false;
  const strip = (text) => {
    try { const { generatedAt, ...rest } = JSON.parse(text); return JSON.stringify(rest); } catch { return null; }
  };
  const prior = strip(priorText);
  return prior !== null && prior === strip(nextText);
}

// The run report — the FULL fleet roster, every repo named under exactly one state,
// emitted on every run (the PR only opens when the fleet moved, and a fleet that
// did not move still deserves an account of itself — including who was inactive
// today, a daily fact that deliberately lives here and not in the file, because
// `unchanged` above ignores the day stamp). Pure so the full-roster property is
// testable directly.
export function renderUsageSummary(file) {
  const { folding, absent, dormant, uncovered, outOfScope } = file.coverage;
  const quiet = inactiveToday(file);
  const quietSet = new Set(quiet);
  const active = folding.filter((r) => !quietSet.has(r));
  return [
    `# Fleet usage sweep — ${file.generatedAt}`,
    '',
    '| folding | inactive today | absent | dormant | uncovered | out of scope |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${folding.length} | ${quiet.length} | ${absent.length} | ${dormant.length} | ${uncovered.length} | ${outOfScope.length} |`,
    '',
    active.length ? `**Folding, active today:** ${active.join(', ')}` : '**Folding, active today:** none',
    quiet.length ? `**Folding, inactive today (no captured activity on ${file.generatedAt}):** ${quiet.join(', ')}` : '',
    absent.length ? `**Absent (should be folding and isn't):** ${absent.join('; ')}` : '',
    dormant.length ? `**Dormant (self-declared, out of the denominator):** ${dormant.join(', ')}` : '',
    uncovered.length ? `**Uncovered (the census's subject):** ${uncovered.join(', ')}` : '',
    outOfScope.length ? `**Out of scope:** ${outOfScope.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

export async function main() {
  // The sweep resolves the HOME repo — the one whose claudinite-fleet-sheepdog pack entry carries the
  // fleet config, and the one the aggregate lands in — from GITHUB_REPOSITORY.
  // Actions sets it and the subprocess inherits it; CLAUDINITE_REPO is the
  // scheduler's own name for the same fact, so fall back to it rather than depending
  // on which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }
  const root = process.env.CLAUDINITE_REPO_ROOT || process.cwd();
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const base = process.env.CLAUDINITE_DEFAULT_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN is not set — the sweep cannot deliver its aggregate');

  log('reading every member\'s usage aggregate');
  const file = await sweep();
  const text = renderFleetFile(file);
  const covered = file.coverage.folding.length;
  const gaps = file.coverage.absent.length;

  const summary = renderUsageSummary(file);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  const baseSha = baseTip(root, remoteUrl(repo, token), base);
  if (unchanged(readAt(root, baseSha, FLEET_USAGE_PATH), text)) {
    log(`${covered} member(s) folding, ${gaps} coverage gap(s) — recompute is unchanged, nothing to deliver`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const pr = await deliverGenerated({
    root, repo, base, token, stamp: today, branchPrefix: PR_BRANCH_PREFIX, log,
    files: { [FLEET_USAGE_PATH]: text },
    message: 'Claudinite: recompute the fleet skill-usage aggregate',
    title: 'Claudinite: fleet skill-usage aggregate',
    body: [
      `Recomputed \`${FLEET_USAGE_PATH}\` from the fleet members' own usage aggregates.`,
      '',
      `**${covered}** member(s) folding (**${inactiveToday(file).length}** of them inactive today); `
        + `**${gaps}** coverage gap(s) under \`coverage.absent\`; **${file.coverage.dormant.length}** dormant, `
        + `**${file.coverage.uncovered.length}** uncovered and **${file.coverage.outOfScope.length}** out-of-scope `
        + 'repo(s) named under `coverage` — the file accounts for every repo under the owner.',
      '',
      'A stateless full recompute: this file is a pure function of the members\' current',
      'files, so it self-heals any past error and an unchanged fleet opens no PR.',
      'Machine-written — never hand-edit it.',
    ].join('\n'),
  });
  log(`${covered} member(s) folding, ${gaps} coverage gap(s) — ${pr.reused ? 'updated' : 'opened'} `
    + `PR ${pr.number !== null ? `#${pr.number}` : `on ${pr.branch}`}`
    + `${pr.merged ? ' (landed)' : pr.delivery === 'review' ? ' (left for review)' : ''}`);
}

// Run only when invoked directly (code-work's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => fleetWorkerFailed('fleet-usage', e));
}
