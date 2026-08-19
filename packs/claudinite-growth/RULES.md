# claudinite-growth — authoring Claudinite content here

Rules for the content a repo authors for itself: the lessons its capture runs write into its local
packs, and the scheduled tasks that do the writing. A member's own Claudinite *status* — the mount,
the declaration, adoption, the update — is claudinite-lifecycle's.

- **Writing or changing a task** — the [writing-tasks](skills/writing-tasks/SKILL.md) skill
  is the contract, and the precondition is the only place a task may decide not to run. A task
  is a unit of the repo's own work, not a synonym for agentic work or for a cron: the code-work
  phase is the default, and an agentic phase and a cadence are each optional.

- **Wanting a job to run in Actions** — make it a task with a `code_work` command rather than
  authoring a workflow; the vendored workflows already own the trigger, the concurrency, the
  secrets and the failure reporting. Work with no cadence is a task too, on
  `frequency: 'manual'`, woken by whatever knows the event happened.
