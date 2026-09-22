## 2026-08-24 · born · Claudinite growth: extract lessons (#1310)
- **Source:** the growth-extract run over the window in #1305 - twenty conversation captures across
  the fresh and hindsight passes.
- **Reason:** a fleet-follow wait re-waited six blind minutes after a first wait had already shown
  no movement; reading the gating logic took a minute and said not to expect any.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Re-waiting on a signal that already failed to move".
- **Landed:** #1310 (Refs #1305).

## 2026-08-24 · moved · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Re-waiting on a signal that already failed to move".
  it was carried by .claudinite/local/packs/claudinite/RULES.md until here; say why the carrier
  changed.
- **Landed:** #1315 (Closes #1312).
