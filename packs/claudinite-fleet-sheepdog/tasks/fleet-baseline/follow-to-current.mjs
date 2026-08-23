// THE FOLLOW: from "a dispatch was accepted" to "this member is current".
//
// A dispatch POST returning 204 says the run was QUEUED and nothing more. A sweep
// that reports those 204s reports its own outgoing calls, not the fleet — and it
// reads as fleet-wide delivery when it was not: #1292 recorded a run announcing
// `13 fired, 0 failed` where 9 of the 13 took nothing.
//
// So the lever follows each member to a TERMINAL condition, and the condition is
// read off the member itself: does its `.claudinite-settings.json` stamp the engine
// and every declared pack at the versions canon publishes? That comparison already
// exists in this pack — `canonVersions` and `classifyFreshness`, written for the
// roster's drift issues — and is imported rather than reimplemented.
//
// THIS IS NOT #649's SLEEP COMING BACK. What that retired was a blind fixed wait,
// long enough for the slowest member, paid by every run whatever the fleet was
// doing. This polls a real condition and each member LEAVES the loop the moment it
// reads current: a fleet already at canon terminates on the first pass in seconds,
// and only a member genuinely mid-converge costs any waiting at all.
//
// ALREADY-CURRENT IS A SUCCESS, and a distinct one. A member at canon's versions
// before the dispatch correctly declines its own update — the precondition says the
// mount converged in this window and no pack moved — and never "does work". Folding
// that into a failure would report a fault where there is none; folding it into
// `converged` would claim work that did not happen. It is its own outcome.
//
// WHAT THIS CANNOT SEE. Freshness here is the PUBLISHED VERSION NUMBERS. Engine or
// pack content that shipped without a version bump is invisible to any version
// comparison, so a member can read `already-current` while lacking canon's newest
// commit — exactly the case #1292 found. The rendered report says so in its own
// words rather than letting "current" imply more than it checked.

import { SCHEDULER } from '../../fleet-api.mjs';
import { canonVersions, classifyFreshness, probeMount, FRESH } from '../fleet-roster/drift-issues.mjs';

export { canonVersions };

// Every terminal verdict a followed member can end on. Two are successes; the rest
// each name a DIFFERENT thing for the reader to do, which is why this is a state per
// member and not a count of failures.
export const ALREADY_CURRENT = 'already-current';
export const CONVERGED = 'converged';
export const NEVER_STARTED = 'never-started';
export const DID_NOT_CONVERGE = 'did-not-converge';
export const UNKNOWN = 'unknown';

export const isSuccess = (outcome) => outcome === ALREADY_CURRENT || outcome === CONVERGED;

// The poll cadence: quick at first, because a member that was already current answers
// on the first pass and a fast converge lands inside a minute or two, then backing off
// so a long converge is not paid for in API calls. Capped so the loop keeps checking
// at a useful rate right up to the budget.
export const POLL_MS = [15_000, 30_000, 45_000, 60_000];
export const pollDelay = (round) => POLL_MS[Math.min(round, POLL_MS.length - 1)];

// Did this member's scheduler actually START on our dispatch? A `workflow_dispatch`
// run created at or after the instant we fired. Distinguishing "never started" from
// "started and did not finish" matters: the first is a dispatch that vanished — a
// disabled workflow, a revoked grant — and the second is a converge to go and read.
//
// Judged by STATUS: a listing that does not answer is not evidence of absence, so it
// throws rather than reporting the member as never-started.
export async function startedSince(gh, fullName, sinceIso) {
  const { status, json } = await gh(
    `/repos/${fullName}/actions/workflows/${SCHEDULER}/runs?event=workflow_dispatch&per_page=20`);
  if (status !== 200) throw new Error(`could not list ${SCHEDULER} runs: ${status}`);
  const since = Date.parse(sinceIso);
  return (json?.workflow_runs ?? []).some((r) => Date.parse(r.created_at) >= since);
}

// This member's freshness right now, read fresh off its own declaration every time —
// the whole point is to observe a value that is changing under us, so nothing here
// may be cached from an earlier pass.
export async function readFreshness(gh, fullName, readDeclaration, { canon }) {
  const declaration = await readDeclaration(gh, fullName);
  if (declaration === null) {
    return { state: 'no-declaration', detail: 'the settings file disappeared mid-run' };
  }
  return classifyFreshness(await probeMount(gh, fullName, declaration, { canon }));
}

// Follow every member in `members` to a terminal outcome, or to the budget.
//
// `members` is one entry per FIRED member: `{ fullName, firedAt, wasFresh }`, where
// `wasFresh` is what the pre-dispatch read already established — the sweep has that
// declaration in hand, so re-deriving it here would be a second read of a file we
// deliberately read before firing.
//
// `sleep` and `now` are injected so the whole loop tests without wall-clock time; the
// caller passes the real ones.
export async function followToCurrent(gh, members, {
  canon, readDeclaration, budgetMs, now = () => Date.now(), sleep, log = () => {},
}) {
  const pending = new Map(members.map((m) => [m.fullName, m]));
  const done = new Map();
  const deadline = now() + budgetMs;

  for (let round = 0; pending.size > 0; round += 1) {
    for (const [fullName, m] of [...pending]) {
      let verdict;
      try {
        verdict = await readFreshness(gh, fullName, readDeclaration, { canon });
      } catch (e) {
        // Indeterminate, not terminal: a transient read failure must not condemn a
        // member that is converging fine. It is only reported as UNKNOWN if the
        // budget runs out while it is still failing.
        m.lastError = e.message;
        continue;
      }
      m.lastError = null;
      if (verdict.state === FRESH) {
        done.set(fullName, {
          ...m,
          outcome: m.wasFresh ? ALREADY_CURRENT : CONVERGED,
          detail: verdict.detail,
        });
        pending.delete(fullName);
      } else {
        m.lastVerdict = verdict;
      }
    }
    if (pending.size === 0) break;

    const remaining = deadline - now();
    const delay = pollDelay(round);
    if (remaining <= 0) break;
    log(`- ${done.size}/${members.length} current; still following ${[...pending.keys()].join(', ')}`);
    await sleep(Math.min(delay, remaining));
  }

  // Whatever is still pending when the budget is gone: say WHICH kind of not-current
  // it is, because the fix differs. A member that never started is a dispatch that
  // went nowhere; one that started and is still behind is a converge to go and read.
  for (const [fullName, m] of pending) {
    let started = null;
    try {
      started = await startedSince(gh, fullName, m.firedAt);
    } catch (e) {
      m.lastError = e.message;
    }
    const outcome = m.lastError ? UNKNOWN : (started ? DID_NOT_CONVERGE : NEVER_STARTED);
    done.set(fullName, {
      ...m,
      outcome,
      detail: outcome === UNKNOWN
        ? `could not be read: ${m.lastError}`
        : outcome === NEVER_STARTED
          ? `no ${SCHEDULER} run started since the dispatch — the run was queued and never ran`
          : `its scheduler ran, and it is still ${m.lastVerdict?.detail ?? 'not at canon versions'}`,
    });
  }

  // Report order follows the sweep's, so a member sits in the same place in every
  // table this run prints.
  return members.map((m) => done.get(m.fullName));
}
