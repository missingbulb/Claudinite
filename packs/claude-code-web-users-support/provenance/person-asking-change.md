## 2026-08-08 · born · Personal preferences as a pack, and one general primitive: a pack's own session-start step (#567)
- **Reason:** the pack is an address rather than the content, so the one thing a session can get
  wrong is writing a person's preference where the pack lives instead of where the store does. A
  preference that turns out to be a project convention in disguise belongs to the pack that owns its
  subject, since conventions are the project's and these travel with a person across every project
  they work in.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose in the pack's RULES.md, which is what a session gets when the pack is active.
- **Landed:** #567 · pack version 1.

## 2026-09-03 · reworded · claude-code-web-users-support: RULES.md carries only what instructs a session (#1626)
- **Reason:** the rule opened on the act of editing a file, which is not the moment anything brings
  a session to it - what a session sees is a person asking for their preferences to change, so it
  opens there. It was also cut to the ration the pack-prose guidance sets, from 77 words.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1626 (Closes #1625) · pack version 60902.1.

## 2026-09-21 · reworded · what is edited is a pack now, and its provenance moved inside it (#2188)
- **Reason:** the rule named a file in the store and a sidecar provenance folder beside it. A
  person's directory is a pack, so its provenance sits where every other pack keeps it.
- **Actor:** @missingbulb (owner).
- **Landed:** #2188

## 2026-09-25 · reworded · the pack is at `<path>/<login>/` (#2321)
- **Reason:** personal packs are addressed by GitHub login.
- **Actor:** @missingbulb (owner).
- **Landed:** #2321
