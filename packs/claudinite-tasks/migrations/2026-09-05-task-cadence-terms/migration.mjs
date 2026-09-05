// A member's own task declarations state their cadence as a precondition term
// (tasks-dispatch DESIGN §5, #1725): every `.claudinite/local/packs/<pack>/tasks/
// <name>/task.json` still carrying the retired `frequency` field has it folded
// into `preconditions` — `due:<cadence>` first in the list, `woken` for `manual`,
// a `none` beside it dropped — as anchored text, so the file's own layout survives.
//
// THE WRITE IS THE ENGINE'S. `retireTaskFrequency: true` names the registry's named
// codemod (engine/migrations/registry.mjs, `applyTaskFrequencyRetirement`), which
// runs the same rewrite the CLI does. A record cannot carry it: which files hold
// the field is the member's own disk.
//
// GATED ON THE MOUNT, BY CONTENT. Rewriting is only safe once the member's vendored
// `claudinite-tasks` reads the cadence term — the door in its task-contract turns
// `frequency` into that term, and its calendar spells the term; an older mount
// would validate `due:daily` as an unknown condition and skip the task. The two
// lanes deliver on their own cadences, so `appliesTo` probes the mounted calendar
// for the spelling rather than trusting the stamp; an unreadable mount reads as
// "not capable" and the record stays inert. The canon runs the same probe against
// its own tree (two-root form).
//
// IDEMPOTENT by construction: a task.json with no `frequency` line is nothing to
// rewrite. No apply stage: the rewrite is text, and a session has nothing to add.
const CALENDAR = 'packs/claudinite-tasks/calendar.mjs';
const mountReadsCadence = async (read) => {
  const text = (await read(`.claudinite/shared/${CALENDAR}`)) ?? (await read(CALENDAR));
  return Boolean(text) && text.includes('cadenceTermFor');
};

export default {
  id: 'task-cadence-terms',
  landed: '2026-09-05',
  version: '60905.3',
  summary: 'a member\'s local-pack task.json declarations fold the retired `frequency` field into `preconditions` as the cadence term it meant (#1725)',

  appliesTo: mountReadsCadence,
  retireTaskFrequency: true,

  // The telemetry hook cannot list directories, and the fact this record retires —
  // a `frequency` line under the member's local packs — is only visible by listing.
  // The fleet-visible signal is the `legacy-task-fields` advisory on every remaining
  // field; the door's removal is gated on that advisory's convergence window (#1725).
  legacyPresent: async () => false,
};
