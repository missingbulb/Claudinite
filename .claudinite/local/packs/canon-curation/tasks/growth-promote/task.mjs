// canon-curation task: growth-promote — the growth lifecycle's CENTRAL stage
// (per-project-scheduling DESIGN §6, table 2). Reads the participating members'
// local packs, generalizes the portable lessons, and opens an owner-gated PR
// against the canon. A fleet-scoped task: it runs only on the canon repo's own
// scheduler (only the canon declares canon-curation), and its precondition reads
// the `fleet` signal — the members aggregate over the fleet PAT.
//
// Self-contained (imports nothing): the whole contract is this default export.
//
// "Central, once" is enforced by declaration cardinality, not orchestrator
// wiring: only the canon home repo declares canon-curation, so this task exists
// nowhere else. No barrier — promote reads whatever is already MERGED on members'
// mains, so a lesson extracted tonight (03:00, extract) is promoted this same
// 04:00 run when its auto-merge landed in time, else the next night (DESIGN §2).

export default {
  id: 'growth-promote',
  frequency: 'daily',                    // the 04:00 slot — after the fleet's 03:00 extracts (DESIGN §2)
  precondition_signals: ['fleet'],       // canon-only aggregate: which members changed their local packs
  agent_model: 'opus',                   // portability, dedup-vs-corpus, and routing are the heaviest judgment
  expected_outcome: 'open-pr',           // the judgment gate before shared canon — owner-approved, never auto-merged
  agent_instructions: 'task.md',
  agent_execution_timeout: 2700,         // reading N members + generalizing + authoring a PR — generous bound, extreme protection

  // Fire when a participating member changed its local packs in the window. A
  // participant declares grow_with_claudinite and carries local packs (the only
  // source promote reads); the growth entry's `{ config: { promote: false } }`
  // opts a member out of promotion while it keeps extracting/deduping locally
  // (absent or true = participate). A member whose local packs didn't move in the
  // window has nothing new to lift up — so the daily trigger targets exactly the
  // changed set, and the executor's Context binds the worker to those members.
  precondition(signals) {
    const fleet = signals.fleet;
    if (!fleet) return { run: false, reason: 'no fleet signal (FLEET_GITHUB_TOKEN unset, or not the canon repo)' };
    if (fleet.error) return { run: false, reason: `fleet enumeration failed — ${fleet.error} (retiring/promoting nothing on unproven fleet state)` };
    const participants = (fleet.members ?? [])
      .filter((m) => m.activePacks.includes('grow_with_claudinite') && m.hasLocalPacks)
      .filter((m) => m.packConfigs?.grow_with_claudinite?.promote !== false);
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
