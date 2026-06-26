# Temporary workarounds

Short-lived stopgaps for environment bugs we're currently living with. Each entry is a workaround, not a principle — the goal is to **delete** these once the underlying bug is fixed, not to accumulate them. Loads every session (the root [CLAUDE.md](../CLAUDE.md) `@`-imports it) so the workaround is in force before you act.

- **Never try to delete a remote branch.** A bug in the current environment makes deleting a remote branch fail at the transport layer — the push disconnects (`remote end hung up unexpectedly` / `unexpected disconnect while reading sideband packet`) and never succeeds. Don't run `git push origin --delete <branch>` or `git push origin :<branch>`; leave the merged branch in place (it's harmless) and, if it must go, delete it from the GitHub UI.
