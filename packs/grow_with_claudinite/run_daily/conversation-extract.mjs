// grow_with_claudinite run_daily task: conversation-extract — the conversation-side
// sibling of growth-extract. Mines the repo's captured conversation logs (the orphan
// conversation-logs branch, written by merge-to-main's capture step) for durable
// lessons, posts the dialogue behind each extracted rule on the issue it was worked
// under, and prunes logs past the entry's retention_days. Worker: the co-located
// conversation-extract.md.
//
// An ordinary independent planner unit, MCP-native and central like every fleet
// worker — extraction only READS the already-pushed logs (get_file_contents), writes
// lessons to the member's local packs (push_files), comments via add_issue_comment,
// and prunes via delete_file. (Only CAPTURE needs the live session transcript, so
// capture stays in-session at merge; extraction does not, so it is a regular
// run_daily task, not a per-repo schedule.)

export default {
  id: 'conversation-extract',
  worker: 'packs/grow_with_claudinite/conversation-extract.md',
  full_sweep_supported: true,
  smarts: 'high', // deciding what clears the lesson bar is the heaviest judgment

  async gate(repo, signals) {
    // Fire the day after a real merge — that's when a fresh capture sits on the
    // conversation-logs branch (a merge is a substantiveChange; a [skip ci] capture
    // commit is not, so substantiveChange tracks the merge, not the capture). The
    // worker no-ops when the branch holds nothing fresh, exactly like growth-extract
    // when the window yields no lesson.
    if (signals.substantiveChange) {
      return { run: true, targets: {}, reason: 'recent merge — extract any freshly captured conversation logs' };
    }
    // The weekly full sweep re-processes (dedup absorbs the overlap) and, crucially,
    // runs the retention prune even on a repo gone quiet — a log ages out on wall
    // time, not on the repo changing.
    if (signals.fullSweep) {
      return { run: true, targets: {}, reason: 'weekly full conversation extract + retention prune' };
    }
    return { run: false };
  },
};
