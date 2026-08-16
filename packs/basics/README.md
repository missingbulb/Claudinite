# basics pack

The baseline pack — the `RULES.md` prose every session loads (injected by the pack-prose hook) plus the working-discipline checks. Its subject is **how work is done**, whatever tool is running it. Declared explicitly like every other pack — no pack is active by default; bootstrap seeds the declaration and the nightly baselining backfills it into existing consumers.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Starting any requested change | high | correctness | prose: 59 words |
| Replying to an owner comment | high | complexity | prose: 109 words + check (`comment-classification`) |
| Acting on a correction | high | correctness | prose: 39 words |
| Acting on a feature | high | correctness | prose: 39 words |
| Acting on a process change | medium | complexity | prose: 67 words |
| Choosing what goes on that ladder | medium | complexity | prose: 82 words |
| Landing a rule anywhere on the ladder | high | correctness | prose: 64 words |
| Building a mechanism for a behavior | medium | complexity | prose: 18 words |
| Building release, deploy, versioning or CI plumbing | medium | complexity | prose: 46 words |
| Finishing a change | high | correctness | prose: 33 words |
| Changing scheduled or unattended machinery | high | correctness | prose: 36 words |
| Planning a migration | medium | complexity | prose: 52 words |
| When verifying now is genuinely impossible | medium | complexity | prose: 40 words |
| Receiving feedback that flags a misunderstanding | medium | complexity | prose: 29 words |
| Writing anything | low | complexity | prose: 18 words |
| Correcting or auditing an artifact against an authoritative source | high | correctness | prose: 35 words |
| Acting on an approval to merge, ship or proceed | high | correctness | prose: 69 words |
| Searching for a tool with ToolSearch | medium | complexity | prose: 57 words |
| Calling Edit | low | complexity | prose: 39 words |
| Needing exact text from the web | high | correctness | prose: 56 words |
| Hitting a sandbox or proxy that denies a fetch | critical | legal | prose: 64 words |
| Seeing a build, test or CI warning | medium | correctness | prose: 28 words |
| Suppressing a warning | medium | complexity | prose: 74 words + check (`warning-suppression`) |
| Waiving a finding on text rather than code | low | complexity | prose: 26 words |
| Working around a finding from a vendored check | medium | complexity | prose: 29 words |
| Deferring a warning you can't fix now with a small cause-addressing change | medium | complexity | prose: 136 words |
| Handing over a step only a human can perform | high | complexity | prose: 132 words |
| Naming a file, module, or symbol | low | complexity | prose: 22 words |
| Referring to a value from more than one place | high | correctness | prose: 117 words + check (`shared-constants`) |
| Writing file A so it depends on file B | medium | complexity | prose: 48 words |
| Committing | medium | complexity | prose: 43 words |
| Working with a file a test or tool generates | high | correctness | prose: 64 words + check (`generated-merge-driver`) |
| Writing code that depends on how a platform or runtime behaves | high | correctness | prose: 31 words |
| Optimising | high | correctness | prose: 53 words |
| Needing a library for a narrow job | medium | complexity | prose: 27 words |
| Answering an edge case a review raised | medium | complexity | prose: 55 words |
| Documenting a procedure | medium | complexity | prose: 40 words |
| Writing code that can silently do nothing | high | correctness | prose: 76 words |
| Persisting anything on a user's machine | medium | correctness | prose: 43 words |
| Changing what the software does with a user's data | critical | legal | prose: 90 words |
| Driving an external runtime more than once in a session | low | complexity | prose: 51 words |
| Automating something that needs live conversation context | medium | complexity | prose: 46 words |
| Writing the exit path of a pipeline or CI step | medium | correctness | prose: 26 words |
| Killing a process by pattern | high | correctness | prose: 34 words |
| Working in a fresh checkout or sandbox | low | complexity | prose: 54 words |
| Deciding where a config value or a classification lives | medium | complexity | prose: 69 words |
| Handling a value that can be unknown | high | correctness | prose: 103 words |
| Writing a check that scans the repo | high | correctness | prose: 93 words |
| Writing a comment | low | complexity | prose: 93 words |

## Checks

The working-discipline rules with a deterministic signature. The world rules read repo state; the four work rules judge the change and the session in front of you.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `markdown-link-labels` | low | complexity | check: blocking |
| `declared-check-messages` | medium | complexity | check: blocking |
| `file-placement` | medium | complexity | check: advisory |
| `shared-constants` | high | correctness | check: blocking |
| `warning-suppression` | medium | complexity | check: blocking |
| `rules-line-length` | low | complexity | check: advisory |
| `claude-md-length` | medium | performance | check: advisory |
| `generated-merge-driver` | medium | correctness | check: advisory |
| `catalog-completeness` | medium | complexity | check: blocking |
| `comment-classification` | high | complexity | check: blocking |
| `reference-integrity` | medium | correctness | check: blocking |
| `task-lifecycle` | medium | complexity | check: blocking |
| `squash-merge-history` | high | correctness | check: blocking |
