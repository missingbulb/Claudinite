## 2026-07-14 · born · Make fleet daily maintenance MCP-native: no REST, census decoupled, migration repo unified (#294)
- **Reason:** the fleet run went to a no-op day: every in-session code step returned 401, because
  the scheduled runtime has no GitHub REST credential, only the MCP tools.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "The routine's own
  in-session steps reach GitHub through the session's MCP tools - never a REST client or a
  GITHUBTOKEN.".
- **Landed:** #294 (Closes #295).

## 2026-07-14 · reworded · lessons-learned: diagnose in-session egress with a proxy-honoring probe, not node fetch (#296)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #296 (Refs #295).

## 2026-07-19 · reworded · google-identity: prose → skill-owned checks, enforcement-silent canon docs, shared line-scanning lib (#350)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #350 (Refs #303).
