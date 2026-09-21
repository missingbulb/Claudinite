## 2026-08-17 · born · Move the environment setup script into the web pack, and converge the clone's git config at session start (#956)
- **Reason:** only a managed container has a Setup script field, and the web base image ships no
  toolchains, so a web session can run a project's tests only if somebody pasted one in. The body
  installs every active pack's declared requirement, which is why it is identical for every project
  and never changes as those requirements do - so the instruction is to paste it whole and unedited,
  and a project-specific step belongs in the owning pack's `env` declaration instead.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose in the pack's RULES.md, beside the script it names; the engine may not name a
  pack, so the file stays the canonical copy and is reached by its unique filename.
- **Landed:** #956 (Fixes #955) · pack version 2.

## 2026-09-03 · reworded · claude-code-web-users-support: RULES.md carries only what instructs a session (#1626)
- **Reason:** the rule was a section describing the Setup script and the image behind it; what
  changes a reader's behaviour is the halt-gate they are standing in front of, so it opens there and
  the description moves to the pack README.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1626 (Closes #1625) · pack version 60902.1.
