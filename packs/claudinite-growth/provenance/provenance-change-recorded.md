## 2026-09-20 · born · the work half of the provenance convention (#2176)
- **Source:** the provenance design (#2136), section 7: the entry a change owes lands in the same
  change, or the Stop hook says so.
- **Reason:** the decision behind a change exists only in the head of whoever made it, at the moment
  they made it; a log appended later is a reconstruction.
- **Actor:** @missingbulb (owner) approved the design; the session that wrote #2176 landed it.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded work-scope check in claudinite-growth, blocking, since 2026-09-20: a
  carrier whose decision-bearing text changed (markers and whitespace off) names a file that gained
  an entry, a deleted carrier's file ends retired, and a file only grows. Coded rather than declared
  because a declared check cannot read a bullet whose last line and bold trigger wrap.
- **Rejected:** teaching every editing skill the append; the check says it once, at the Stop hook,
  for every skill.
- **Retire when:** the append is made by the tool that edits the carrier, so no session can forget
  it.
- **Landed:** #2176.

## 2026-09-20 · severity-changed · a lost or altered line is advised against, never refused
- **Source:** #2180, the first backfill: the conversion had left declarative-content-set-icon.md a
  `born` dated by the references write, and the rule refused the backfill's rewrite with the
  element's derived history.
- **Reason:** the owner's call: the check must not prevent deletions in a provenance file, only
  advise against them, and the correct history is the diff's to show.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the growth branch is one advisory finding inside the blocking rule, its fix text
  naming both ways out: restore and append, or leave the rewrite where it is the correct history.

## 2026-09-20 · severity-changed · a shared file: an unmarked guideline and a deleted carrier owe their entry there
- **Source:** #2177 declared the file-placement skill `guidelines`, and the world half then read its
  28 definitional bullets as 28 unmarked elements.
- **Reason:** the owner's call: several carriers (guidelines, rules, checks, tasks) may share one
  provenance file while their history is one, splitting only on divergence, so a skill's provenance
  is denoted once and not per line.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** an unmarked guideline owes on its skill's file, and the skill owes nothing for the
  bullet itself; a carrier deleted while a live carrier still names its file owes any entry there,
  and only a file no carrier names must end retired.
