// jwt task: jwt-advisory-watch — the one JWT concern that moves with the
// outside world rather than with this repo's commits. JWT libraries have a
// history of critical vulnerabilities (the alg:none era hit several at once),
// and a repo that never touches its lockfile still becomes vulnerable the day
// an advisory publishes. So the watch is a MONTHLY floor, deliberately
// ungated on repo movement: the trigger lives outside the repo, so there is
// no signal to gate on (contrast tidy-prs, whose verdicts only change when a
// PR moves). Worker: task.md. Assess-only: recommends bumps in its tracker,
// never opens a PR or edits a manifest.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'jwt-advisory-watch',
  frequency: 'monthly',                     // an advisory watch is a floor, not an alert channel
  precondition_signals: [],                 // the trigger is the outside world — nothing repo-side gates it
  agent_model: 'sonnet',                    // version-range vs advisory-range comparison is a judgment call
  expected_outcome: 'none',                 // assess-only: writes only its tracker issue
  agent_instructions: 'task.md',
  agent_execution_timeout: 900,             // a handful of manifest reads and advisory lookups

  precondition() {
    return {
      run: true,
      reason: 'JWT library advisories publish on the outside world\'s clock — the monthly sweep runs unconditionally',
      context: ['Check the repo\'s JWT/JOSE libraries against published security advisories (read-only — recommend bumps in the tracker, never change a manifest).'],
    };
  },
};
