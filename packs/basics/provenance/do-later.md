## 2026-09-01 · born · converted from references.md (do-later-1)
- **Reason:** #1160 carried its `Model:` line six paragraphs below its waits, where a retry
  rewriting `Not-before:` had no one block to edit and readers could not see what the run would do.
- **Mechanism:** a step of the do-later skill, a workflow

## 2026-09-22 · trigger-changed · the description names the mark it says to apply
- **Reason:** the description said "marked for the queue", the fuzziness the new
  `queue-mark-named-literally` check now flags anywhere.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** the description keeps its trigger phrases; only the label it names became literal.
