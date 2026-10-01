## 2026-08-25 · born · Claudinite growth: extract lessons (#282)
- **Source:** #246.
- **Reason:** a flawed `<existing-rules>` placeholder caught seconds after dispatch was fixed by a
  second full dispatch, ~172s and ~95K tokens of duplicate compute.
- **Actor:** growth-extract run, merged by the owner.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Catching a flawed prompt right after dispatching a
  background subagent".
- **Landed:** #282.

## 2026-09-20 · reworded · Claudinite growth: dedup local packs (#696)
- **Reason:** the resume-not-redispatch half is now canon's unattended-agents skill near verbatim;
  stripped to the residue, pointing a subagent at a file's path over pasting it.
- **Actor:** growth-dedup run, merged by the owner.
- **Landed:** #696 (Refs #683).

## 2026-09-25 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
