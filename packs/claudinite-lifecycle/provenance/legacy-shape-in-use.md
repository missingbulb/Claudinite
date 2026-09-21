## 2026-09-03 · born · telling the repo that still holds a legacy shape (#1645)
- **Source:** an audit of about 28 legacy declaration sites across the engine and the packs, none
  with a scheduled removal and one carrying a stated end date that had passed with nothing arranged
  to notice.
- **Reason:** every tolerance in the tree was silent. A member reading its own declaration had no
  way to learn it was on a shape scheduled for removal, and the removal is gated on those members
  letting go.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a world advisory firing in the repo that holds the old shape rather than in the
  canon that tolerates it, naming the edit that moves it forward. Permanently advisory: the old
  shape works, so it may not stop a member's build. Every engine constant it reads is
  namespace-imported and guarded, because the two lanes converge on separate cycles and this pack
  spends windows beside an engine that predates one of the symbols.
- **Landed:** #1645 (Closes #1637) · pack version 60903.3.

## 2026-09-03 · reworded · it states the window the repo has to act (#1652)
- **Reason:** claiming the removal waits on nobody carrying the shape makes the finding sound
  optional, and the canon cannot see which repos are active anyway.
- **Actor:** @missingbulb (owner).
- **Landed:** #1652 · pack version 60903.4.
