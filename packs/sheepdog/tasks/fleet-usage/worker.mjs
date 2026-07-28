// The fleet-usage preprocessing entry point — the script the scheduler runs as
// `node worker.mjs` (cwd = this task dir, bounded by agent_preprocessing_timeout).
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
// non-zero exit, and the scheduler treats a non-zero preprocessing subprocess as a
// failed task — it converges one open `needs-human` issue for the task family
// (engine/scheduler/run.mjs) instead of handing off to any agent.

import { pathToFileURL } from 'node:url';
import { deliverGenerated, baseTip, readAt, remoteUrl } from '../../../../engine/scheduler/deliver-generated.mjs';
import { main as sweep, FLEET_USAGE_PATH } from './aggregate-fleet-usage.mjs';

const PR_BRANCH_PREFIX = 'claudinite/fleet-usage';
const slotId = process.env.CLAUDINITE_SLOT_ID || '';
const log = (s) => console.log(`fleet-usage${slotId ? ` [${slotId}]` : ''}: ${s}`);

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

export async function main() {
  // The sweep resolves the HOME repo — the one whose sheepdog pack entry carries the
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
  const text = `${JSON.stringify(file, null, 2)}\n`;
  const covered = file.coverage.folding.length;
  const gaps = file.coverage.absent.length;

  const baseSha = baseTip(root, remoteUrl(repo, token), base);
  if (unchanged(readAt(root, baseSha, FLEET_USAGE_PATH), text)) {
    log(`${covered} member(s) folding, ${gaps} coverage gap(s) — recompute is unchanged, nothing to deliver`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const pr = await deliverGenerated({
    root, repo, base, token, stamp: today, branchPrefix: PR_BRANCH_PREFIX,
    files: { [FLEET_USAGE_PATH]: text },
    message: 'Claudinite: recompute the fleet skill-usage aggregate',
    title: 'Claudinite: fleet skill-usage aggregate',
    body: [
      `Recomputed \`${FLEET_USAGE_PATH}\` from the fleet members' own usage aggregates.`,
      '',
      `**${covered}** member(s) folding; **${gaps}** coverage gap(s) listed under \`coverage.absent\`.`,
      '',
      'A stateless full recompute: this file is a pure function of the members\' current',
      'files, so it self-heals any past error and an unchanged fleet opens no PR.',
      'Machine-written — never hand-edit it.',
    ].join('\n'),
  });
  log(`${covered} member(s) folding, ${gaps} coverage gap(s) — ${pr.reused ? 'updated' : 'opened'} `
    + `PR ${pr.number !== null ? `#${pr.number}` : `on ${pr.branch}`}`);
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`fleet-usage failed: ${e.message}`); process.exit(1); });
}
