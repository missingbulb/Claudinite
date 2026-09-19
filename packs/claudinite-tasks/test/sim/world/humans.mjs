// A PERSON'S ACTIONS, as events.
//
// No `src/world/humans.mjs` to stand in for, and there never will be: a person
// is not something the engine calls. They are the other writer on the same
// issues, which is the whole reason the mechanism arbitrates at all — so the
// harness needs them to be schedulable at an instant, exactly like a cron fire.
//
// Every action writes through the GitHub fake's PORT, not into its arrays: a
// person marking an issue and the engine reading it back have to go through the
// same store, or a scenario proves a world where the two never met. The one
// thing that does not go through the port is the `labeled` webhook, which is not
// a write at all — `deliversLabeledEvent()` is what a caller asks before booking
// the run a label edit would have triggered, and the GitHub fake's dropped-event
// fault is what makes it answer no.
//
// The labels are IMPORTED from `public/task-constants.mjs`. A person applies the
// engine's own vocabulary — that is the point of a mark — so a fake spelling its
// own copy would keep passing after the vocabulary moved.

import { ORIGIN_AD_HOC, STATUS_READY, STATUS_LABELS } from '../../../public/task-constants.mjs';

export function makeHumans({ clock, github, repo = 'o/r', login = 'owner' } = {}) {
  // Run now, or book it for an instant. `at` is the only option every action
  // takes, because "when" is the one thing about a person the harness models.
  const doIt = (at, fn) => {
    if (at === undefined) return fn();
    clock.at(at, fn);
    return null;
  };

  const issueOf = (number) => github.find(number);

  const harness = {
    // Somebody opens an issue and marks it for the queue. Their prose is the
    // body; the machine block is the scheduler's to write at adoption.
    markIssue: ({ title = 'A thing to do', body = 'Please do the thing.', labels = [], at } = {}) => doIt(at, () => {
      const created = github.seedIssue({
        title, body, labels: [ORIGIN_AD_HOC, ...labels], user: { login },
      });
      return created;
    }),
    // Withdrawing the ask: the mark comes off, and the item stops being one.
    withdrawMark: (number, { at } = {}) => doIt(at, () => github.port.removeLabel(null, repo, number, ORIGIN_AD_HOC)),

    addLabel: (number, name, { at } = {}) => doIt(at, () => github.port.addLabel(null, repo, number, name)),
    removeLabel: (number, name, { at } = {}) => doIt(at, () => github.port.removeLabel(null, repo, number, name)),

    // The sanctioned re-queue, exactly as a park's own comment instructs: drop
    // the status, apply ready. A label edit and nothing else — no comment, no
    // marker — which is what makes it different from the wake lever.
    requeue: (number, { at } = {}) => doIt(at, async () => {
      const issue = issueOf(number);
      if (!issue) return null;
      for (const l of issue.labels.filter((x) => STATUS_LABELS.includes(x))) {
        await github.port.removeLabel(null, repo, number, l);
      }
      return github.port.addLabel(null, repo, number, STATUS_READY);
    }),

    comment: (number, body, { at } = {}) => doIt(at, () => github.port.comment(null, repo, number, body)),
    closeIssue: (number, { reason = 'not_planned', at } = {}) => doIt(at, () => github.port.closeIssue(null, repo, number, reason)),
    reopenIssue: (number, { at } = {}) => doIt(at, () => github.port.reopenIssue(null, repo, number)),

    // A review left on a pull request. Nothing in the queue reads reviews yet,
    // so it is recorded on the pull rather than invented as an API.
    approvePull: (number, { at } = {}) => doIt(at, () => {
      const pr = github.findPull(number);
      if (pr) (pr.reviews ??= []).push({ state: 'APPROVED', user: { login }, at: clock.ms() });
      return pr;
    }),
    mergePull: (number, { at } = {}) => doIt(at, () => github.port.mergePull(null, repo, number, { merge_method: 'squash' })),
    closePull: (number, { at } = {}) => doIt(at, () => github.port.closePull(null, repo, number)),

    // Whether the `labeled` webhook the edit above would have fired actually
    // arrives. A dropped one is not a lost write — the label is on the issue
    // either way — it is a run that never starts, and the next cron is the
    // guarantee that covers it.
    deliversLabeledEvent: () => github.takeLabeledEvent(),
  };
  return harness;
}
