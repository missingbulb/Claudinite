#!/usr/bin/env node
// Claude Code PreToolUse guard: blocks actions the corpus forbids outright, before
// they run. Exit 2 blocks the tool call and feeds stderr back to the agent.
// Registered per-repo — see bootstrap.md. Two forbidden actions today:
//   1. Bash pushes that delete a remote branch (the delete-push fails in this
//      environment, so it can never succeed).
//   2. Scheduling a deferred self-check-in to confirm CI / babysit a PR
//      (send_later / ScheduleWakeup / create_trigger): a webhook that won't push
//      CI-success is a reason to *query* the status directly, not to poll on a
//      re-arming cadence.
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(input); } catch { /* no payload → allow */ }
  const name = payload.tool_name ?? '';

  if (name === 'Bash') {
    const cmd = payload.tool_input?.command ?? '';
    const deletesRemoteBranch =
      /\bgit\s+push\b[^\n;&]*\s(--delete|-d)\s/.test(cmd) ||
      /\bgit\s+push\b[^\n;&]*\s\S+\s+:\S/.test(cmd);
    if (deletesRemoteBranch) {
      process.stderr.write(
        'Blocked: never delete a remote branch — a current environment bug makes the delete-push fail, so it cannot succeed. Leave the branch; it can be deleted from the GitHub UI if needed.'
      );
      process.exit(2);
    }
    process.exit(0);
  }

  // send_later / create_trigger arrive MCP-namespaced (mcp__<server>__send_later);
  // ScheduleWakeup is a built-in. Match by suffix so server casing doesn't matter.
  const schedulesWakeup =
    name === 'ScheduleWakeup' || name.endsWith('send_later') || name.endsWith('create_trigger');
  if (schedulesWakeup) {
    const text = payload.tool_input?.message ?? payload.tool_input?.prompt ?? '';
    const isSelfCheckIn =
      /\bself[-\s]?check[-\s]?in\b/i.test(text) ||
      /\bre-?arm\b/i.test(text) ||
      /\bconfirm\b[^.]*\bgreen\b/i.test(text);
    if (isSelfCheckIn) {
      process.stderr.write(
        "Blocked: don't schedule a deferred self-check-in to confirm CI or babysit a PR. A webhook not delivering CI-success is a reason to *query*, not to poll on a re-arming cadence. Ask the platform directly for the check-run / workflow-run status (e.g. pull_request_read get_check_runs) on a short backoff bounded to the run's own duration, until it settles: green → report and stop, red → act. Don't re-arm — a stale-but-open PR awaiting human review is a safe state to end your turn on."
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
