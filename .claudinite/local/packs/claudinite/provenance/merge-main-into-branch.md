## 2026-09-06 · born · converted from references.md (check:merge-main-into-branch)
- **Reason:** #880: a merge commit trips the blocking squash-merge-history check and costs a full
  rebase, a discarded CI run and a fresh wait — paid twice in one evening.
- **Mechanism:** a check

## 2026-09-06 · severity-changed · Date the three action checks added today so they do not convict the past (#1773)
- **Reason:** an action check is re-judged over the whole session transcript at Stop, so a blocking
  one with no creation date convicts calls made before it existed in the session's tree - and an
  action finding has no clearing move, so it blocks every Stop for the rest of that session. It
  happened within the hour these three landed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `since: 2026-09-06`, which `applyGrace` reads as advisory for the grace window.
- **Landed:** #1773 (Closes #1772).
