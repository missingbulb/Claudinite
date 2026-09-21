## 2026-08-11 · born · Promote two store/seed checks from Sheepdog PR #110 to the canon (#755)
- **Source:** Sheepdog PR #110, which proposed a member-local preferences-store pack and was closed;
  its closing comment recorded that two of its checks were worth keeping but belonged in the canon
  rather than in a member.
- **Reason:** every file in a preferences store is the README or one person's identity, which is a
  property of being a store and not of the member that holds one - and a name nobody will ever open
  is the one thing the fail-soft reader can never say. Landing it here lets it import the store
  resolver and the identity test as siblings, so it can never be stricter or looser than the code
  that opens a person's file; the member-local version had to reach across the vendored mount for
  the same guarantee and carried a file-placement acceptance to do it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world check, advisory to match its sibling for the same reason - the loss is a
  nicety nothing depends on and the fix is a rename - and relevance-gated on the repo actually
  holding the store its own declaration names, so it is inert in every member that declares the pack
  only to read a store living elsewhere. It reads the store off the engine's normalized per-pack
  config rather than re-parsing the settings file.
- **Landed:** #755.

## 2026-09-21 · severity-changed · it judges directories now, because that is what the reader opens (#2188)
- **Reason:** the check exists to say the one thing the fail-soft reader never can: a name nobody
  will ever open. The reader now pours `<path>/<email>/`, so a flat file in the store is the
  unaddressable shape and a directory named for an identity is the clean one.
- **Actor:** @missingbulb (owner).
- **Mechanism:** unchanged carrier and severity - advisory, relevance-gated on this repo actually
  holding the store. What moved is its scope: one finding per top-level entry rather than per file,
  because a misnamed directory holding a whole pack is one mistake with one fix.
- **Landed:** #2188
