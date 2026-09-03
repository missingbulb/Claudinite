# html pack

Declared for hand-authored HTML (no reliable fingerprint). Prose plus one activity-triggered skill.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Injected block markup lands beside the <p> | medium | correctness | prose: 112 words |
| Investigate a live page before you ship | high | correctness | prose: 82 words |
| Make a console request a snippet | low | complexity | prose: 39 words |

The ambiguous slash-date algorithm is the [`parsing-page-dates`](skills/parsing-page-dates/SKILL.md)
skill.

## Skills

| Skill | Trigger |
|---|---|
| [`parsing-page-dates`](skills/parsing-page-dates/SKILL.md) | extracting dates from scraped HTML |
