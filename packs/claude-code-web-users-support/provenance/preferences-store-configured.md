## 2026-08-08 · born · Personal preferences as a pack, and one general primitive: a pack's own session-start step (#567)
- **Reason:** the pack is seeded by default and carries an address rather than content, so a repo
  can declare it and never answer the adoption question - leaving the feature silently inert with
  nothing saying so.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world check, advisory: the loss is a nicety no other check or task depends on,
  and nothing here may block a session.
- **Landed:** #567 · pack version 1.

## 2026-09-21 · reworded · it reads the store's address from its new home (#2189)
- **Reason:** the address resolver moved from `store.mjs` to `user_pack_address.mjs`; the check's
  own judgment is unchanged.
- **Actor:** @missingbulb (owner).
- **Landed:** #2189
