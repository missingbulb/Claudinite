# html pack

Declared for hand-authored HTML (no reliable fingerprint). Prose-only.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Injected block markup inside a <p> silently empties it — read the sibling, not the tag. | medium | correctness | prose: 76 words |
| An ambiguous numeric slash date can't be resolved from its digits — infer the document's convention once, don't guess per-field. | high | correctness | prose: 156 words |
| When code must react to how a real page actually behaves, investigate it live before you ship — don't deploy a hypothesis you can only test after release. | high | correctness | prose: 81 words |
| Make that console request a snippet, not an essay. | low | complexity | prose: 38 words |
