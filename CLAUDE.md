# Working inside the Claudinite repo

This is the Claudinite **source** repo — it defines the portable corpus that
consuming repos mount at `.claudinite/` and import with `@.claudinite/README.md`.
Those same guidelines apply to work done *here*, so this repo consumes itself:
the import below pulls in the corpus index for every session that starts in this
directory, exactly as a consumer's `CLAUDE.md` does.

`README.md` is both the human-facing front page and the agent-facing index. It
is a **soft map**, not an eager payload — follow its pointers (`general/`,
`preferences/<your-user>.md`, `technologies/`) on demand, when the task calls for
them. See the "how to traverse this corpus" section there.

@README.md
