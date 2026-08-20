// basics task: verify-in-production — the follow-up that comes back on its own
// when a change could not be watched working at the moment it landed (#1091).
//
// The repo's other tasks look at the world and decide what to do about it. This one
// looks at a QUEUE it did not fill: every issue the `verify-in-production` skill
// filed at the end of a change, each naming the condition that puts that change in
// production and the assertion that proves it works there. The run's whole job is
// to ask, per issue, "is it live yet?" — and either prove the change or leave the
// issue exactly as it found it.
//
// STANDING STATE IS THE RIGHT GATE HERE, unusually. The rule against it exists
// because a standing fact stays true forever once true, so a run keeps re-deriving
// the same verdict; an open verification issue is instead a work item that the work
// itself removes — every issue this task can act on, it closes. A pile that does
// not shrink means nothing has reached production yet, which is exactly the state
// this task exists to sit through.
//
// Ceilinged at `none`. A verification that FAILS files what it found and closes the
// verification issue pointing at it; fixing the change is a separate piece of work
// with its own review, never a PR this task opens off a failed assertion.
//
// Self-contained but for the marker it shares with the filing skill.

import { isVerificationIssue } from './marker.mjs';

export default {
  id: 'verify-in-production',
  // Daily. The wait is for someone else's release — a nightly converge, a deploy,
  // the next session — so the useful cadence is "come back later", and an hourly
  // re-ask would spend a session per hour on a change that lands overnight. A
  // verification that wants tighter timing than this is one you could have watched
  // now, which the skill sends back rather than filing.
  frequency: 'daily',
  precondition_signals: ['issues'],
  agent_model: 'sonnet',        // "is it live, and does it work there" is judgment against the real world
  expected_outcome: 'none',     // writes issues only — its own queue, and a finding
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,

  precondition(signals) {
    const pending = (signals.issues?.open ?? []).filter((i) => isVerificationIssue(i.title));
    if (!pending.length) return { run: false, reason: 'no change is waiting on a production verification' };
    return {
      run: true,
      reason: `${pending.length} change(s) waiting to be verified in production`,
      context: [`Verifications to check: ${pending.map((i) => `#${i.number}`).join(', ')}.`],
    };
  },
};
