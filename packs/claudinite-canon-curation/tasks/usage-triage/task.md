# Usage triage — the shelf

The corpus that reaches a session is placed on the promotion ladder by judgment at
authoring time. The usage review reads back whether the placement held, and hands
you the findings that have lasted. Your job is to turn one into a change the owner
can read as a diff.

Load [triaging-usage-findings](../../../claudinite-growth/skills/triaging-usage-findings/SKILL.md)
and follow it. It owns the order: the element's provenance file first, then the
rule's causes worked in order, then the edit — and no edit at all where no cause is
settled.

## Scope

`packs/` — the shelf. One pull request per subject, carrying the edit itself and
the element's provenance entry for it in the same diff.

The Context section is binding scope: propose about the subjects it names, and do
not re-derive which findings count. The review's file,
`.claudinite/local/usage-review.GENERATED.json`, carries each finding's figures,
its possible causes and its issue number.

Never merge what you open. Where you settle no cause, comment that finding's issue
with what you read and what would settle it, and open nothing for it.

Deliver the pull request through the [shared procedure](../../../claudinite-tasks/src/deliver/deliver-pr.md).
Its body names the cause you settled on and what settled it, the provenance fields
you read, the window the finding was written from, and the finding's issue number.
