## 2026-08-20 · born · /do-later - defer a change into a chained, blocked request run (#1082)
- **Reason:** a follow-up spotted mid-session had nowhere to go: implementing it derails the
  session, and an ordinary issue waits for somebody to remember it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Spotting a change that should wait until the work in
  flight lands".
- **Landed:** #1082 · pack version 12.
