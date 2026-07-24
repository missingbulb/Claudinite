// canon-curation task: growth-discover-packs — the pack-discovery pipeline
// (per-project-scheduling DESIGN §6, table 2). RELOCATED here from
// grow_with_claudinite: it moves from member-scheduled/centrally-executed to one
// plainly central weekly sweep over every participating member, so first-sight
// dedup is trivial (a single run sees every manifest and authors each unhomed
// technology once). Fleet-scoped: runs only on the canon repo's own scheduler.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'growth-discover-packs',
  frequency: 'weekly',                   // one weekly sweep over the whole fleet — a stack is slow-moving
  precondition_signals: ['fleet'],       // canon-only aggregate: the participating members to manifest
  agent_model: 'opus',                   // past step 1 every step is heavy judgment (is a technology unhomed, does a rule mechanize, what fingerprint detects it)
  expected_outcome: 'open-pr',           // authors packs as owner-approved PRs, one per pack
  agent_instructions: 'task.md',
  agent_execution_timeout: 3600,         // manifest N members + author packs — a wide, once-weekly bound

  // Fire weekly when there is at least one participating member — a repo declaring
  // grow_with_claudinite (the growth pack owns discovery). The Context binds the
  // worker to the full participant list, which it processes in one run so a
  // technology homed by an earlier member is on the shelf for the rest (the
  // first-sight dedup, now trivial with a single sweep).
  precondition(signals) {
    const fleet = signals.fleet;
    if (!fleet) return { run: false, reason: 'no fleet signal (FLEET_GITHUB_TOKEN unset, or not the canon repo)' };
    if (fleet.error) return { run: false, reason: `fleet enumeration failed — ${fleet.error}` };
    const participants = (fleet.members ?? []).filter((m) => m.activePacks.includes('grow_with_claudinite'));
    if (!participants.length) return { run: false, reason: 'no participating member declares grow_with_claudinite' };
    const repos = participants.map((m) => m.repo);
    return {
      run: true,
      reason: `weekly pack discovery over ${participants.length} participating member(s)`,
      context: [
        `Members to manifest (process all in this one run — first-sight dedup within it): ${repos.join(', ')}.`,
        'Do not enumerate the fleet yourself or widen past this list.',
      ],
    };
  },
};
