# html pack

Declared for hand-authored HTML (no reliable fingerprint). Prose-only.

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Injected block markup inside a <p> silently empties it — read the sibling, not the tag. | 76 | medium | correctness | prose |
| An ambiguous numeric slash date can't be resolved from its digits — infer the document's convention once, don't guess per-field. | 156 | high | correctness | prose |
| When code must react to how a real page actually behaves, investigate it live before you ship — don't deploy a hypothesis you can only test after release. | 81 | high | correctness | prose |
| Make that console request a snippet, not an essay. | 38 | low | complexity | prose |
