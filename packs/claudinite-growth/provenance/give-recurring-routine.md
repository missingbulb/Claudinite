## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Mechanism:** a bullet of the `agenticBestPractices.md` corpus doc, the unattended-agents skill's
  ancestor.
- **Landed:** commit 5235b9d3.

## 2026-07-08 · reworded · Rework daily-maintenance & release actions: living tracker, fresh failure issues, privacy fold (#167)
- **Reason:** a tidy report that comments only when something changed reads as a feed; a current
  picture belongs in the body, newest snapshot at the top.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #167 (Closes #166).

## 2026-07-14 · reworded · Standardize tracking-issue titles; stop toggling their open/closed state (#298)
- **Reason:** two trackers had no fixed title and were found by a fuzzy match; and a tracker's job
  is the log, not its open/closed state, so a run only ever appends.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #298 (Refs #297).

## 2026-08-23 · scope-changed · Retire the growth, wiki and jwt standing trackers for the pack's VERSIONS.md (#1262)
- **Reason:** eight of the eleven trackers logged what automatic work did to a local pack, a record
  the commit and its pull request already carry.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "Give a recurring routine
  a standing tracking issue only when its output is a current picture nothing else holds".
- **Landed:** #1262 (Closes #1258).
