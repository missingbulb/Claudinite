import { finding } from '../../engine/checks/helpers/findings.mjs';

// After a merge lands, a plan's GitHub tracking issue — the "read status and pick
// up the work" entry point (e.g. #394) — must be brought in sync: the checklist
// item this merge completed gets its box flipped, in the same session, AFTER the
// merge (an item isn't done until it's on `main`). The committed migration plan is
// drift-guarded by code review; nothing guards the issue checklist, so it silently
// falls behind. This is that guard — see docs/tracking-issue-freshness/DESIGN.md.
//
// It is transcript-only by necessity: in-session code holds no GitHub REST
// credential (the blocking in-session-github-access rule), so neither this rule
// nor any in-session check can read the issue over the API. The transcript's MCP
// tool calls are the offline evidence — the merge, the tracker discovery, and the
// checklist edit all appear there as tool_use inputs. The Stop hook grows a
// post-merge trigger (stop-command.mjs) so the runner fires even on the clean tree
// the merge recipe leaves behind.
const rule = {
  id: 'plan-tracking-freshness',
  severity: 'blocking',
  description: 'After a merge, a plan-tracking issue consulted this session must have a checklist box flipped',
  doc: 'docs/tracking-issue-freshness/DESIGN.md',
  scope: 'work',
  why: 'the tracking issue is the next agent\'s status entry point; a committed plan is drift-guarded by review, the issue checklist by nothing — so it must be synced in the session that merged',

  run(work) {
    // No merge this session (or no transcript at all) ⇒ nothing to sync. Self-skip.
    const merges = work.mergedThisSession();
    if (!merges.length) return [];
    const lastMerge = merges[merges.length - 1];

    // Offline blind spot: if the session never consulted a plan-tracking issue,
    // no tracker is knowable here — don't nag on an unverifiable claim. Self-skip.
    const convo = work.conversation();
    const trackers = convo.planTrackingIssues();
    if (trackers.size === 0) return [];

    // A box flipped on one of those trackers after the merge ⇒ synced.
    if (convo.checklistUpdatesAfter(lastMerge.time).some((u) => trackers.has(u.issue))) return [];

    const list = [...trackers].sort((a, b) => a - b).map((n) => `#${n}`).join(', ');
    return [finding(rule, {
      file: '(conversation)',
      what: `PR #${lastMerge.pr ?? '?'} merged this session, but no plan-tracking issue (${list}) had a checklist box flipped afterward`,
      fix: `sync the tracker: call issue_write (method update) on ${list} with the item(s) this merge completed flipped to \`- [x]\` — do it after the merge, and a bare status comment isn't enough`,
    })];
  },
};

export default rule;
