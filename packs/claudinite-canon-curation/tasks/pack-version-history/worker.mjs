// The pack-version-history entry point: regenerate every pack's `VERSIONS.md` from
// the base branch's history — which pull requests landed between one version and the
// next — and deliver the records that changed on a pull request that lands itself.
//
// The rows are `../../pack-versions.mjs`'s to derive; this file is the I/O shell:
// fetch the base tip with its history, plan, and hand the changed files to the
// generated-file lane, which commits them on the executor's target branch, opens or
// amends the task's pull request and lands it under the task's automerge policy.
// A recompute that changes no record opens nothing.

import { deliverGenerated, remoteUrl } from '../../../claudinite-tasks/public/delivery.mjs';
import { AUTOMERGE_TRAILER } from '../../../claudinite-tasks/public/task-constants.mjs';
import { policyExpression } from '../../../claudinite-tasks/public/task-declaration.mjs';
import { normalizeTaskDeclaration } from '../../../claudinite-tasks/public/task-declaration.mjs';
import { planHistory } from '../../pack-versions.mjs';
import { fetchBase, makeGit } from '../pack-version-bump/worker.mjs';
import taskJson from './task.json' with { type: 'json' };

// The declaration as the loader sees it, defaults filled — the policy the arming
// trailer below carries is the one this task declared.
const task = normalizeTaskDeclaration(taskJson);
export const TASK_ID = 'claudinite-canon-curation/pack-version-history';

// The item this run belongs to, stamped on every line the task prints. Module-level
// because the helpers below log too, and set once from the bag when the run starts.
let item = '';
const log = (s) => console.log(`pack-version-history${item ? ` [#${item}]` : ''}: ${s}`);

export async function worker(params) {
  item = params.item.number ? String(params.item.number) : '';
  const root = params.root;
  const repo = params.repo;
  const token = params.token;
  const base = params.defaultBranch ?? 'main';
  if (!repo) throw new Error('CLAUDINITE_REPO / GITHUB_REPOSITORY is not set (owner/repo)');
  if (!token) throw new Error('GITHUB_TOKEN is not set — the history cannot read the base branch or deliver its PR');
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

  const pr = await deliverGenerated({
    root, repo, base, token, log,
    // Which branch and pull request this lands on is the executor's decision, handed
    // in as environment — the lane has no discovery of its own and refuses a run
    // that arrives without one.
    branch: params.target.branch,
    pr: params.target.pr,
    task: TASK_ID,
    files,
    message: `Claudinite: pack version history\n\n${AUTOMERGE_TRAILER}: ${policyExpression(task.automerge)}`,
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
