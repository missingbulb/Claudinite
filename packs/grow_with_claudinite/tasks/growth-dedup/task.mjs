// grow_with_claudinite task: growth-dedup — the growth lifecycle's PRUNING stage
// (per-project-scheduling DESIGN §6). Prunes local-pack items the canon now
// covers, keeping items the canon states too generally; lands the prunes through
// one PR against the default branch, delivered per the repo's delivery settings.
// Worker: task.md.
//
// The old fleet's `relevantCanonChanged` becomes the `sharedMount` signal — a
// declared pack's vendored files moving is the local echo of "the canon this repo
// mounts changed" — so movement, never the calendar, is what wakes this: a quiet
// repo with no local packs skips.
//
// The cadence is WEEKLY, not daily (#582). A member's mount moves most nights —
// baselining converges it daily — so a daily slot fired this opus dispatch, and the
// PR behind it, nearly every night. Pruning is not latency-sensitive: a
// local item the canon has already absorbed stays harmlessly correct until it goes,
// so the daily slot bought noise rather than freshness. Nothing is missed by the
// move — both signals below are WINDOW-scoped, and the collection window is the
// widest due task's period, so the weekly run sees a full 7 days of canon and
// local-pack movement batched into one dispatch.
//
// Self-contained (imports nothing): the whole contract is this default export.

// How many changed files one pack contributes to the Context before the rest are
// counted rather than listed. A dispatch issue is read by a person as well as an
// agent, and a heavy canon week can move dozens of files in one pack; the count
// keeps the truncation visible instead of passing a partial list off as the set.
const FILES_LISTED_PER_PACK = 15;

// The Context lines that turn "these packs moved" into "read this diff". A pack
// name sends the run re-reading a whole corpus for coverage that mostly predates
// the window; what can NEWLY cover a local item is what the canon ADDED in the
// window, so the dispatch hands over the moved files and the date to diff from.
// Both fields are absent on a mount whose vendored collector predates them, and
// the run still works off the pack names alone — so each is emitted only when
// the signal actually carries it, never as an empty assertion.
function canonDiffContext({ changedFiles, sinceIso }) {
  const lines = [];
  const entries = Object.entries(changedFiles ?? {}).filter(([, files]) => files?.length);
  if (entries.length) {
    lines.push('These are the canon files that moved in the window — read their diff first; the lines and checks they ADDED are where this run\'s prunes come from:');
    for (const [pack, files] of entries) {
      const shown = files.slice(0, FILES_LISTED_PER_PACK).join(', ');
      const rest = files.length - FILES_LISTED_PER_PACK;
      lines.push(`- ${pack}: ${shown}${rest > 0 ? ` (+${rest} more under this pack — read them too)` : ''}`);
    }
  }
  if (sinceIso) lines.push(`The window opens at ${sinceIso} — diff the canon from there to now.`);
  return lines;
}

export default {
  id: 'growth-dedup',
  frequency: 'weekly',             // the weekly anchor — prunes against the mounted canon that morning's 02:00 baselining converged (DESIGN §2)
  precondition_signals: ['localPacks', 'sharedMount', 'commits'],
  agent_model: 'opus',                   // proving the canon genuinely covers a local item — and telling coverage from "stated too generally" — is a judgment call
  expected_outcome: 'merged-pr',            // one PR per run, delivered to land per the repo's delivery settings (a `review` member degrades it to open-pr)
  agent_instructions: 'task.md',
  agent_execution_timeout: 1800,            // proving canon coverage per local item — generous bound, extreme protection

  // Gate: the repo must actually track local packs (no local packs → nothing to
  // prune, self-skip). Given local packs, run when the mounted canon this repo
  // CARES about moved — a declared pack's vendored files changed (`sharedMount`),
  // which can newly cover a local item — or the repo's own local packs changed in
  // the window (a fresh local item to re-check against the canon). A quiet repo
  // with local packs but no relevant movement skips.
  precondition(signals) {
    const local = signals.localPacks ?? {};
    // `present` is null when the scheduler couldn't determine it; treat only an
    // explicit false as "definitely no local packs to prune".
    if (local.present === false) {
      return { run: false, reason: 'no local packs — nothing to prune' };
    }
    const changedPacks = signals.sharedMount?.changedPacks ?? [];
    const canonMoved = changedPacks.length > 0;
    const localChanged = local.changedInWindow === true;

    if (canonMoved) {
      return {
        run: true,
        reason: `declared pack(s) changed in the mounted canon: ${changedPacks.join(', ')} — local items may now be covered`,
        context: [
          `Re-check local items against these newly-changed canon packs: ${changedPacks.join(', ')}.`,
          ...canonDiffContext(signals.sharedMount ?? {}),
        ],
      };
    }
    if (localChanged) {
      return { run: true, reason: 'local packs changed in the window — re-check the fresh items against the mounted canon' };
    }
    return { run: false, reason: 'local packs present but no relevant canon or local movement in the window' };
  },
};
