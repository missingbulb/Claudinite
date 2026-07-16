// canon-curation run_daily task: growth-promote-to-claudinite — the growth
// lifecycle's central stage. Reads the changed participating members' local docs,
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
  order: null,
  full_sweep_supported: true,
  smarts: 'high', // portability, dedup-vs-corpus, and routing are the heaviest judgment

  async gate(repo, signals) {
    if (!signals.isHome) return { run: false }; // promote runs only from the canon home
    const participants = (signals.fleetMembers ?? [])
      .filter((m) => m.activePacks.includes('grow_with_claudinite'));
    if (signals.fullSweep) {
      return {
        run: true,
        targets: { repos: participants.map((m) => m.repo) },
        reason: 'weekly full promote over all participating members',
      };
    }
    // substantiveChange, not projectChanged: don't target a member whose only
    // in-window main move was housekeeping (bot bump / baselining) — there's no new
    // merged lesson to promote from it (see routines/fleet/signals.mjs).
    const changed = participants.filter((m) => m.substantiveChange);
    if (changed.length) {
      return {
        run: true,
        targets: { repos: changed.map((m) => m.repo) },
        reason: `${changed.length} participating member(s) changed substantively in the window`,
      };
    }
    return { run: false };
  },
};
