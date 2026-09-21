## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** ShoutsAndWhispers `dev/requirements/saga/`, the kind's first implementation.
- **Reason:** the other kinds capture resting states; a requirement about a transition or a
  causality ("a message sent before I arrived never appears") has no resting state to photograph, so
  it is captured as an ordered storyboard of golden frames whose narrative captions surface in the
  spec's gallery.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a `RULES.md` section of its own.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-07-10 · reworded · the animated saga golden (APNG) variant (#206)
- **Source:** the ShoutsAndWhispers session that merged as its PR 6, the pack's named `saga`
  reference project.
- **Reason:** a per-step still proves a resting state, so a strip of them proves a transition's
  endpoints and not the transition; one animated golden per leaf records the real UI moving.
  Promoted as a variant, with the stills form left valid.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Rejected:** GIF, whose palette and dithering are not deterministic, so byte-identity comparison
  would no longer hold; the golden is lossless APNG instead.
- **Landed:** #206 (Closes #207) · pack version 1.

## 2026-09-05 · moved · from `RULES.md` into a path-forced skill (#1667)
- **Source:** the audit of every pack's `RULES.md` for rules that only matter while editing a
  nameable file class (#1662).
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the `write-a-saga` skill, forced for `dev/requirements/saga/**`; the bar the move
  was judged against is on the `deterministic-expecteds` file.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.
