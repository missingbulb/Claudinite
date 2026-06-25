# Owner interaction preferences

Personal preferences from the repo owner for how the assistant should
interact — tone, summary style, end-of-turn conventions, and the phrases the
owner uses to trigger defined commands. These are **not** project conventions
(those live in the [general/](../general/) corpus); they're how the owner likes to be
worked with. Where a preference triggers a command whose mechanics are a project
convention, the mechanics stay in their own doc and the entry here just owns the
trigger phrase.

## Preferences

- **When there's nothing left to do, say so boldly at the end of the
  conversation.** Don't bury a "this is complete / I'm blocked / nothing further
  to do" behind hedging — make the terminal state unmistakable.
- **"LGTM"** is the owner's phrase for the merge-to-main command: it asks for
  the change in front of the owner to be merged into `main`. It's an
  owner-triggered command; the mechanics — squash, CI-green, when the
  twice-green gate applies — live in the consuming project's GitHub-procedures
  doc.
- **"bump version"** is the owner's phrase for raising a project's version
  (a minor bump by default). It's an owner-triggered command; the mechanics —
  which files to edit and how a release follows — live in the consuming
  project's workflow doc.
