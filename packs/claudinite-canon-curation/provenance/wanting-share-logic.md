## 2026-09-04 · born · converted from references.md (RULES-5)
- **Reason:** #959's captured session: the owner rejected an `engine/` module shared by two packs'
  tasks ("We can't ever have code that needs to be shared by two packs saved in 'engine'. That
  breaks the model."), and then rejected even a shared file with a drift guard for the one piece
  that was genuinely identical logic ("why do you even need a drift guard? Just write the json.
  Don't overkill").
- **Mechanism:** prose
- **Retire when:** Retire the rule only if the owner reverses that call.
