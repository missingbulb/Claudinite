// The pack-version-history entry point: regenerate every pack's `VERSIONS.md` from
// the base branch's history — which pull requests landed between one version and the
// next — and deliver the records that changed on a pull request that lands itself.
//
// The rows are `../../pack-versions.mjs`'s to derive; this file is the I/O shell:
// fetch the base tip with its history, plan, and hand the changed files to the
// generated-file lane, which commits them on the executor's target branch, opens or
// amends the task's pull request and lands it under the task's automerge policy.
// A recompute that changes no record opens nothing.

import { remoteUrl } from '../../../claudinite-tasks/public/delivery.mjs';
import { AUTOMERGE_TRAILER } from '../../../claudinite-tasks/public/task-constants.mjs';
import { planHistory } from '../../pack-versions.mjs';
import { fetchBase, makeGit } from '../pack-version-bump/worker.mjs';

export const TASK_ID = 'claudinite-canon-curation/pack-version-history';

// The run's own logger, under the task's name and its item. Module-level because the
// helpers below log too; `worker` takes the one the runner built.
let log = console.log;

export async function worker({ root, repo, token, defaultBranch, automerge, deliver, log: runLog }) {
  log = runLog;
  const base = defaultBranch ?? 'main';
  const remote = remoteUrl(repo, token);

  const git = makeGit(root);
  const tip = fetchBase(git, remote, base);
  const files = planHistory(git, tip);
  const changed = Object.keys(files);
  if (!changed.length) {
    log(`${base} at ${tip.slice(0, 10)}: every record already carries a row per version — nothing to deliver`);
    return;
  }
  for (const path of changed) log(`${path}: regenerated`);

  const pr = await deliver({
    files,
    message: `Claudinite: pack version history\n\n${AUTOMERGE_TRAILER}: ${automerge}`,
    title: 'Claudinite: pack version history',
    body: [
      'Regenerated each pack\'s `VERSIONS.md` from the base branch\'s history: a row per version',
      'naming the pull requests that landed between the previous version and it. Rows already',
      'present stand as written; only the versions with no row gain one.',
      '',
      `Records touched: ${changed.map((p) => `\`${p}\``).join(', ')}.`,
    ].join('\n'),
  });
  log(`${changed.length} record(s) — ${pr.reused ? 'updated' : 'opened'} PR ${pr.number !== null ? `#${pr.number}` : `on ${pr.branch}`}`
    + `${pr.merged ? ' (landed)' : pr.delivery === 'review' ? ' (left for review)' : ''}`);
}
