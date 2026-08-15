// canon-curation task: growth-discover-packs — the FLEET sweep for technologies
// the shared canon does not yet home (per-project-scheduling DESIGN §6 table 2,
// §8 clause 2). One weekly pass over every member: read what the fleet is
// actually built on, subtract what packs/ already homes, and open a reviewed PR
// authoring the missing pack.
//
// Distinct from the same-named per-repo task in grow_with_claudinite, which
// authors a repo's OWN local packs and is explicitly barred from re-creating
// what a canon pack homes. This one is the other side of that line: it is the
// only thing that notices a technology in use ACROSS the fleet with no canon
// pack, and authors one. Dispatch is pack-qualified (`<pack>/<task>` in the
// issue title and the run ledger), so the shared id never collides on Claudinite,
// which declares both packs.
//
// Central because ONE run sees every member: first-sight dedup is trivial — the
// third member using a technology is recognised as the same gap as the first,
// with no cross-run state. That was the argument for keeping this central when
// everything else moved per-repo.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'growth-discover-packs',
  frequency: 'weekly',                   // the fleet's stacks are slow-moving — a weekly sweep, not a daily one
  precondition_signals: ['fleet'],       // canon-only aggregate: who the members are and what they declare
  // @deprecated-ok — sanctioned holdout: the canon's ordinary executor does not hold
  // the fleet, and this task reads every member's tree, so its dispatch must reach
  // the separate fleet routine (ready-for-agent-fleet).
  session_scope: 'fleet',
  // …and its queue-dispatch replacement (tasks-dispatch DESIGN §12): reach is a
  // property of WHICH endpoint the executor calls, so a task needing more than an
  // ordinary session names one. The key resolves in this repo's own config; until
  // it is configured, hand-off converges the item to triage naming what is missing.
  invocation_endpoint: 'fleet',
  agent_model: 'opus',                   // judging what is genuinely canon-worthy and authoring a pack is heavy judgment
  expected_outcome: 'open-pr',           // a new canon pack every repo will read — owner-approved, never auto-merged
  agent_instructions: 'task.md',
  agent_execution_timeout: 3600,         // manifest N members' stacks + author a pack — a generous weekly bound, extreme protection

  // Fire on the covered members, every week. There is no windowed trigger: the
  // opportunity is standing (a technology the fleet uses that no canon pack
  // homes), not a recent change, so the sweep runs weekly and no-ops cheaply
  // when nothing is unhomed. A member with a parsable declaration but no
  // declared packs is not running Claudinite in any usable sense — the same test
  // the fleet reader uses before it probes a member — so it is not swept.
  precondition(signals) {
    const fleet = signals.fleet;
    if (!fleet) return { run: false, reason: 'no fleet signal (FLEET_GITHUB_TOKEN unset, or not the Claudinite repo)' };
    if (fleet.error) return { run: false, reason: `fleet enumeration failed — ${fleet.error} (sweeping nothing on unproven fleet state)` };
    const members = (fleet.members ?? []).filter((m) => m.activePacks.length);
    if (!members.length) return { run: false, reason: 'no covered member to sweep' };
    const repos = members.map((m) => m.repo);
    return {
      run: true,
      reason: `weekly canon pack-discovery sweep over ${members.length} covered member(s)`,
      context: [
        `Members to sweep: ${repos.join(', ')}.`,
        'Read ONLY these members — do not enumerate the fleet yourself or widen past this list.',
      ],
    };
  },
};
