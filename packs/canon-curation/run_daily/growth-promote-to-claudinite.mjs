// canon-curation run_daily task: growth-promote-to-claudinite — the growth
// lifecycle's central stage. Reads the changed participating members' local packs,
// generalizes the portable lessons, and opens a PR against the canon's main.
// Worker: the co-located promote.md.
//
// "Central, once" is enforced by declaration cardinality, not orchestrator wiring:
// only the canon home repo declares canon-curation, so the planner emits at most
// one unit per night. The gate double-locks that (isHome) so a stray declaration
// elsewhere can't double-run promote.
//
// No barrier: promote processes whatever is already MERGED on members' mains — a
// lesson extracted tonight is promoted tomorrow night (the extract commit trips
// the next night's fleetMembers signal). Full mode (weekly): promote over every
// participant regardless of change, the safety net for a skipped night.

export default {
  id: 'growth-promote-to-claudinite',
  worker: 'packs/canon-curation/promote.md',
  full_sweep_supported: true,
  smarts: 'high', // portability, dedup-vs-corpus, and routing are the heaviest judgment

  async gate(repo, signals) {
    if (!signals.isHome) return { run: false }; // promote runs only from the canon home
    // A participant declares the growth pack and tracks local packs — the only source
    // promote reads. The weekly full sweep re-promotes over ALL of them (the safety net
    // for a missed night); the daily trigger targets only those whose LOCAL PACKS
    // actually changed in the window (an extract commit landed) — not merely a member
    // that has local packs, and not one that only changed its product code. A member
    // with nothing new in its local packs has nothing to lift up.
    const participants = (signals.fleetMembers ?? [])
      .filter((m) => m.activePacks.includes('grow_with_claudinite') && m.hasLocalPacks)
      // The growth entry's own settings can opt a member out of promotion —
      // { "id": "grow_with_claudinite", "config": { "promote": false } } — while
      // it keeps extracting/deduping locally; absent or true means participate.
      .filter((m) => m.packConfigs?.grow_with_claudinite?.promote !== false);
    if (signals.fullSweep && participants.length) {
      return {
        run: true,
        targets: { repos: participants.map((m) => m.repo) },
        reason: 'weekly full promote over all participating members with local packs',
      };
    }
    const changed = participants.filter((m) => m.localPacksChanged);
    if (changed.length) {
      return {
        run: true,
        targets: { repos: changed.map((m) => m.repo) },
        reason: `${changed.length} participating member(s) changed their local packs in the window`,
      };
    }
    return { run: false };
  },
};
