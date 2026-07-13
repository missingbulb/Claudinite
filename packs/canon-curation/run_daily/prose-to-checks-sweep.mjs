// canon-curation run_daily task: prose-to-checks-sweep — mine the corpus's
// EXISTING prose for always-testable rules the conversion missed and convert the
// strongest ones (promote descends the ladder for each new lesson; this works the
// backlog, so the corpus keeps shedding context over time). Worker: the
// prose-to-checks skill doc, which owns the method.
//
// Weekly only — the backlog moves slowly, and each pass reads the whole corpus —
// so it fires solely on the home repo's full-sweep night. Opens a PR like every
// other canon change.

export default {
  id: 'prose-to-checks-sweep',
  worker: 'skills/prose-to-checks/SKILL.md',
  order: null,
  full_sweep_supported: true,
  smarts: 'high', // judging convertibility and authoring checks + fixtures is heavy judgment

  async gate(repo, signals) {
    if (!signals.isHome) return { run: false }; // the corpus lives only in the canon home
    if (signals.fullSweep) {
      return { run: true, targets: {}, reason: 'weekly prose-to-checks backlog sweep' };
    }
    return { run: false };
  },
};
