// Required-secrets asking (agent-preprocessing DESIGN §9) — the secrets analogue
// of the pack adoption interview, and deliberately the same shape:
//
//   a DECLARED requirement  (a task's `required_secrets`, like a pack's `questions`)
//   minus what the repo HAS  (the secrets bundle, like the entry's `answers`)
//   = a GAP that drives an ASK, never a gate.
//
// The one difference from the interview is who can answer. A pack question can be
// answered in-session, so the interview surfaces it as a mild SessionStart note. A
// secret can only be added in the repo's Actions settings by someone with admin
// rights, and the run that DISCOVERS the gap is unattended — so the ask is an
// issue, which waits for the owner without blocking anything.
//
// What this deliberately does NOT do: fail a task, block a run, or produce a
// conformance finding. A repo can legitimately sit with an unconfigured secret for
// a while — that task simply doesn't work yet, exactly as an unanswered interview
// question leaves a pack under-configured. The task's own worker reports its own
// missing key when it runs; this just makes sure someone is asked to add it.
//
// Pure over the discovered tasks and the parsed bundle; the `list` CLI at the
// bottom is the bootstrap-side surface, where a session has no bundle to compare
// against and simply reports everything declared.

import { pathToFileURL } from 'node:url';

export const SECRETS_ISSUE_TITLE = 'Claudinite: configure required Actions secrets';

// The declared-but-not-configured secret names, with the tasks that need each.
// Returns [{ name, tasks: ['pack/task', …] }, …], sorted, empty when nothing is
// missing. `configured` is the parsed bundle (name → value); an empty-string
// value is GitHub's rendering of an unset secret, so it counts as missing.
export function missingSecrets(tasks, configured = {}) {
  const byName = new Map();
  for (const task of tasks ?? []) {
    for (const name of task?.decl?.required_secrets ?? []) {
      const value = configured[name];
      if (typeof value === 'string' && value !== '') continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(`${task.pack}/${task.id}`);
    }
  }
  return [...byName.entries()]
    .map(([name, ts]) => ({ name, tasks: [...new Set(ts)].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The owner-facing issue body. Names each secret, what needs it, and where to put
// it — everything required to act without reading any code.
export function renderSecretsIssue(missing, repo) {
  const settings = repo ? `https://github.com/${repo}/settings/secrets/actions` : 'Settings → Secrets and variables → Actions';
  return [
    'One or more scheduled Claudinite tasks in this repo declare a repo **Actions secret** that is not configured yet.',
    'Until it is, those tasks cannot do their work (everything else keeps running normally).',
    '',
    ...missing.map(({ name, tasks }) => `- **\`${name}\`** — needed by ${tasks.map((t) => `\`${t}\``).join(', ')}`),
    '',
    `Add each one at ${settings}, then close this issue. It is re-filed automatically if a secret is still missing,`,
    'and never re-filed while this issue is open.',
  ].join('\n') + '\n';
}

// CLI — `node required-secrets.mjs list`, the bootstrap/adoption surface
// (bootstrap.md Part 2). A session cannot read the repo's Actions secrets, so
// there is nothing to diff against: it prints every secret the declared packs'
// tasks require, and the owner (present by construction at adoption) says which
// are already set. Silent when nothing is required.
async function list(projectRoot) {
  const { discoverTasks } = await import('./discover.mjs');
  const { loadConfig } = await import('../checks/helpers/repo-context.mjs');
  const { tasks } = await discoverTasks(projectRoot, loadConfig(projectRoot));
  const required = missingSecrets(tasks, {}); // no bundle in a session → everything declared
  if (!required.length) return;
  process.stdout.write('Required Actions secrets (declared by this repo\'s scheduled tasks):\n');
  for (const { name, tasks: needs } of required) {
    process.stdout.write(`- ${name} — needed by ${needs.join(', ')}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (process.argv[2] === 'list') await list(projectRoot);
  else { process.stderr.write('usage: required-secrets.mjs list\n'); process.exit(2); }
}
