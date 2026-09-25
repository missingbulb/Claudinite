## 2026-08-11 · born · Promote two store/seed checks from Sheepdog PR #110 to the canon (#755)
- **Reason:** the store's file naming is a property of BEING a store rather than of the member that
  holds one, so the rule that states the address a reader will open lands here beside the code that
  opens it. Stating exactly that address is what the rule is for: anything else is silently never
  opened.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose in the pack's RULES.md, beside the `preferences-store-file-names` check that
  audits the same invariant; the prose carries the invariant and not the enforcement.
- **Landed:** #755.

## 2026-09-03 · reworded · claude-code-web-users-support: RULES.md carries only what instructs a session (#1626)
- **Reason:** the rule opened on the authoring act rather than on the moment a session meets it - a
  person asking to have preferences for the first time - and it scoped itself to the repo that
  happens to hold the store, where the file goes in the store repo wherever that lives.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1626 (Closes #1625) · pack version 60902.1.

## 2026-09-21 · reworded · the first thing to create is a directory, not a file (#2188)
- **Reason:** the address the reader opens moved from `<path>/<email>.md` to `<path>/<email>/`, and
  stating exactly that address is what this rule is for.
- **Actor:** @missingbulb (owner).
- **Landed:** #2188

## 2026-09-25 · reworded · a new pack is named for the lower-case GitHub login, and lands with its CODEOWNERS line (#2321)
- **Reason:** the reader addresses a person by GitHub login, folded to lower case since GitHub
  compares logins case-insensitively; a directory added without regenerating the block has no owner
  line of its own.
- **Actor:** @missingbulb (owner).
- **Landed:** #2321
