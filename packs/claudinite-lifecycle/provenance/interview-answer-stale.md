## 2026-07-22 · born · a stored answer whose question its pack no longer asks (#393)
- **Reason:** the world runner used to import the adoption-interview machinery from one named pack,
  which was the sole reason the engine carried a core/content exception for it. Moving the hygiene
  check into the pack that owns adoption let the engine name no pack at all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a skill-owned world check on the `adopt-claudinite` skill, riding that pack's
  activation, so a repo without the pack never runs it.
- **Landed:** #393 (Closes #392).

## 2026-08-14 · moved · with the adopt-claudinite skill it belongs to (#836)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a skill-owned check moves with its skill, so it keeps riding that skill's
  activation.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
