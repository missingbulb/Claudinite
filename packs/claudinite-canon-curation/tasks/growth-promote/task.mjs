// growth-promote — the growth lifecycle's CENTRAL stage. Reads the participating
// members' local packs, generalizes the portable lessons, and opens an owner-gated
// PR against the canon. A fleet-reaching task: it runs on the canon home repo's own
// scheduler, and its precondition reads the `fleet` signal — the members aggregate
// over the fleet PAT.
//
// Self-contained (imports nothing): the whole contract is this default export.
//
// "Central, once" is enforced by declaration cardinality, not orchestrator wiring:
// a canon is declared by its one home repo, so this task exists nowhere else. No
// barrier — promote reads whatever is already MERGED on members' default branches,
// so a lesson extracted tonight is promoted on the same run when its auto-merge
// landed in time, else the next one.

export default {
  id: 'growth-promote',
  frequency: 'daily',
  // THE CROSS-REPO HALF IS THIS REPO'S OWN scheduler anchor, not a field here. Promote reads what
  // has already merged on MEMBERS' default branches, and `schedule_after:` only ever matches an item
  // in this repo's own queue — so the members-extract-then-canon-promotes ordering has no declarable
  // form and lives in the anchor: a canon home sets its daily hour after its members'.
  //
  // The WITHIN-repo half is declarable, and is: a canon home is a member too, so its own extract must
  // settle before promote reads the local packs it just wrote. A canon that does not declare
  // claudinite-growth queues no such item, and the ordering is then vacuous rather than blocking.
  schedule_after: ['claudinite-growth/growth-extract'],
  precondition_signals: ['fleet'],       // canon-only aggregate: which members changed their local packs
  // This task reads every member's local packs, which an ordinary session in this
  // repo does not reach. Reach is a property of WHICH endpoint the hand-off calls,
  // so a task needing more than an ordinary session names one; the key resolves in
  // this repo's own config, and until it is configured the hand-off converges the
  // item to triage naming what is missing.
  invocation_endpoint: 'fleet',
  agent_model: 'opus',                   // portability, dedup-vs-corpus, and routing are the heaviest judgment
  expected_outcome: 'pr',
  automerge: 'nothing',              // the judgment gate before shared canon — owner-approved, never auto-merged
  agent_instructions: 'task.md',
  agent_execution_timeout: 2700,         // reading N members + generalizing + authoring a PR — generous bound, extreme protection

  // Fire when a participating member changed its local packs in the window. A
  // participant declares claudinite-growth and carries local packs (the only
  // source promote reads); the growth entry's `{ config: { promote: false } }`
  // opts a member out of promotion while it keeps extracting/deduping locally
  // (absent or true = participate). A member whose local packs didn't move in the
  // window has nothing new to lift up — so the daily trigger targets exactly the
  // changed set, and the executor's Context binds the worker to those members.
  precondition(signals) {
    const fleet = signals.fleet;
    if (!fleet) return { run: false, reason: 'no fleet signal (FLEET_GITHUB_TOKEN unset, or this repo is not a canon home)' };
    if (fleet.error) return { run: false, reason: `fleet enumeration failed — ${fleet.error} (retiring/promoting nothing on unproven fleet state)` };
    const participants = (fleet.members ?? [])
      .filter((m) => m.activePacks.includes('claudinite-growth') && m.hasLocalPacks)
      .filter((m) => m.packConfigs?.['claudinite-growth']?.promote !== false);
    const changed = participants.filter((m) => m.localPacksChanged);
    if (!changed.length) return { run: false, reason: 'no participating member changed its local packs in the window' };
    const repos = changed.map((m) => m.repo);
    return {
      run: true,
      reason: `${changed.length} participating member(s) changed their local packs in the window`,
      context: [
        `Target members (local packs changed in the window): ${repos.join(', ')}.`,
        'Read ONLY these members\' local packs — do not enumerate the fleet yourself or widen past this list.',
      ],
    };
  },
};
