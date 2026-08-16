# basics pack

The baseline pack — the `RULES.md` prose every session loads (injected by the pack-prose hook) plus the working-discipline checks. Its subject is **how work is done**, whatever tool is running it. Declared explicitly like every other pack — no pack is active by default; bootstrap seeds the declaration and the nightly baselining backfills it into existing consumers.

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Starting any requested change | 59 | high | correctness | prose |
| Replying to an owner comment | 109 | high | complexity | prose + check (`comment-classification`) |
| Acting on a correction | 39 | high | correctness | prose |
| Acting on a feature | 39 | high | correctness | prose |
| Acting on a process change | 67 | medium | complexity | prose |
| Choosing what goes on that ladder | 82 | medium | complexity | prose |
| Landing a rule anywhere on the ladder | 64 | high | correctness | prose |
| Building a mechanism for a behavior | 18 | medium | complexity | prose |
| Building release, deploy, versioning or CI plumbing | 46 | medium | complexity | prose |
| Finishing a change | 33 | high | correctness | prose |
| Changing scheduled or unattended machinery | 36 | high | correctness | prose |
| Planning a migration | 52 | medium | complexity | prose |
| When verifying now is genuinely impossible | 40 | medium | complexity | prose |
| Receiving feedback that flags a misunderstanding | 29 | medium | complexity | prose |
| Writing anything | 18 | low | complexity | prose |
| Correcting or auditing an artifact against an authoritative source | 35 | high | correctness | prose |
| Acting on an approval to merge, ship or proceed | 69 | high | correctness | prose |
| Searching for a tool with ToolSearch | 57 | medium | complexity | prose |
| Calling Edit | 39 | low | complexity | prose |
| Needing exact text from the web | 56 | high | correctness | prose |
| Hitting a sandbox or proxy that denies a fetch | 64 | critical | legal | prose |
| Seeing a build, test or CI warning | 28 | medium | correctness | prose |
| Suppressing a warning | 74 | medium | complexity | prose + check (`warning-suppression`) |
| Waiving a finding on text rather than code | 26 | low | complexity | prose |
| Working around a finding from a vendored check | 29 | medium | complexity | prose |
| Deferring a warning you can't fix now with a small cause-addressing change | 136 | medium | complexity | prose |
| Handing over a step only a human can perform | 132 | high | complexity | prose |
| Naming a file, module, or symbol | 22 | low | complexity | prose |
| Referring to a value from more than one place | 117 | high | correctness | prose + check (`shared-constants`) |
| Writing file A so it depends on file B | 48 | medium | complexity | prose |
| Committing | 43 | medium | complexity | prose |
| Working with a file a test or tool generates | 64 | high | correctness | prose + check (`generated-merge-driver`) |
| Writing code that depends on how a platform or runtime behaves | 31 | high | correctness | prose |
| Optimising | 53 | high | correctness | prose |
| Needing a library for a narrow job | 27 | medium | complexity | prose |
| Answering an edge case a review raised | 55 | medium | complexity | prose |
| Documenting a procedure | 40 | medium | complexity | prose |
| Writing code that can silently do nothing | 76 | high | correctness | prose |
| Persisting anything on a user's machine | 43 | medium | correctness | prose |
| Changing what the software does with a user's data | 90 | critical | legal | prose |
| Driving an external runtime more than once in a session | 51 | low | complexity | prose |
| Automating something that needs live conversation context | 46 | medium | complexity | prose |
| Writing the exit path of a pipeline or CI step | 26 | medium | correctness | prose |
| Killing a process by pattern | 34 | high | correctness | prose |
| Working in a fresh checkout or sandbox | 54 | low | complexity | prose |
| Deciding where a config value or a classification lives | 69 | medium | complexity | prose |
| Handling a value that can be unknown | 103 | high | correctness | prose |
| Writing a check that scans the repo | 93 | high | correctness | prose |
| Writing a comment | 93 | low | complexity | prose |

## Checks

The working-discipline rules with a deterministic signature. The world rules read repo state; the four work rules judge the change and the session in front of you.

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `markdown-link-labels` | blocking | low | complexity | a Markdown link's label says what it points at, so a reader can route without following it |
| `declared-check-messages` | blocking | medium | complexity | a declared check carries the `failureMessage` / `what` / `fix` text that *is* the rule an agent reads |
| `file-placement` | advisory | medium | complexity | a file sits at its reference distance rather than high above the code that uses it |
| `shared-constants` | blocking | high | correctness | a value spelled in two places carries a drift guard, so the copies cannot diverge silently |
| `warning-suppression` | blocking | medium | complexity | a suppression carries its reason at the site — the inline reason is the whole review record |
| `rules-line-length` | advisory | low | complexity | a rule bullet is wrapped, so a one-word edit diffs as one word rather than a whole paragraph |
| `claude-md-length` | advisory | medium | performance | CLAUDE.md stays short: everything in it loads every session and crowds out the rules that matter |
| `generated-merge-driver` | advisory | medium | correctness | a generated file carries `merge=ours`, so a conflict is re-generated rather than hand-resolved into desync |
| `catalog-completeness` | blocking | medium | complexity | the hand-maintained catalog lists every pack in the tree, so nothing is invisible to a reader routing a rule |
| `comment-classification` | blocking | high | complexity | a reply to an owner comment opens with its classification line, so the work it triggers is the work the comment asked for |
| `reference-integrity` | blocking | medium | correctness | a path or anchor a doc points at still exists after the change that moved it |
| `task-lifecycle` | blocking | medium | complexity | a task has its issue, and the commits reference it |
| `squash-merge-history` | blocking | high | correctness | history stays squash-merged — a landed commit is revised by a new commit, never a rewrite |
