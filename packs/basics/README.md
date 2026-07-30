# basics pack

The baseline pack — the `RULES.md` prose every session loads (injected by the pack-prose hook) plus the core checks. Declared explicitly like every other pack — no pack is active by default; bootstrap seeds the declaration and the nightly baselining backfills it into existing consumers. **Never fingerprinted** (`detect: null`): the declaration is the authority, so dropping `basics` is a deliberate choice a fingerprint must not quietly reverse.

## What it composes

Two packs come along with `basics` through `requires`, materialized into every declaration by the same closure that resolves any dependency — never seeded directly:

- **[`barriers`](../barriers/README.md)**, because the consumer-isolation wall rides that mechanism rather than a check of its own. `basics` **contributes** the fixed barrier as manifest data ([claudinite-isolation.mjs](claudinite-isolation.mjs) — pure data, no cross-pack import, per pack-independence) and the barriers pack builds it into a first-class rule.
- **[`git-github`](../git-github/README.md)**, which carries the git/GitHub side of the task lifecycle (#385).

Both end up universal because `basics` is declared everywhere.

## Bundled skills, and the one task that is not declared here

The [`skills/`](skills/) directory holds the **baseline** skills — general engineering practice any project's work can call for, whatever its technology — mounted wherever `basics` is declared. When one stops being a baseline activity, its directory moves to the pack whose projects need it, and the manifest's `skills` line moves with it (#385 moved the git/GitHub and Claudinite-lifecycle skills out this way).

The baseline **scheduled task** every repo runs — `baselining`, the per-repo self-refresh — lives in [`tasks/baselining/`](tasks/baselining/) and is found by the scheduler's filesystem scan (`engine/scheduler/discover.mjs`), so it is deliberately absent from the manifest. Being in `basics` — declared everywhere — is what makes it universal.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Start from the problem, not solution | prose |
| Confirm behavior isn't already provided | prose |
| A misread ≠ a wrong artifact | prose |
| Clean-room rebuild from the source | prose |
| Fix warnings, never tolerate them | prose |
| Never quick-path a warning suppression | prose + check (`warning-suppression`) |
| An approval applies only backward | prose |
| Task lifecycle: issue → branch → PR | prose + check (`task-lifecycle`) |
