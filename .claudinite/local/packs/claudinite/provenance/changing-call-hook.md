## 2026-09-06 · born · converted from references.md (RULES-70)
- **Reason:** #1711: the per-call hooks run on every tool call, prompt and result, and the harness
  reads exit 2 as the one block while any other exit code, a timeout or non-JSON stdout is an error
  printed beside that call — a judge module missing for a few minutes printed "Cannot find module"
  on every call until it existed. Measured 2026-09-05 (`dev/tools/hook-latency.mjs`): a call no
  declaration named cost ~185 ms at PreToolUse and ~172 ms at PostToolUse before the runner and the
  cached context, ~88 ms and ~80 ms after.
- **Mechanism:** prose
- **Retire when:** Retire the rule when the harness runs hooks in-process or the per-call hooks are
  gone.

## 2026-09-27 · converted · the measurement half is now a check (#2354)
- **Source:** the `claudinite-growth/prose-to-checks-sweep` run on work item #2354.
- **Mechanism:** `call-hook-latency-measured`, a coded work rule (its own file carries why coded).
- **Reason:** deletion test - the bullet stays whole. It carries three directives and the check
  carries one: the guest-in-the-harness half is `hook-judges-never-exit`'s, and recording the
  numbers in the retrospective brief is carried by nothing.
- **Actor:** the `claudinite-growth/prose-to-checks-sweep` run on work item #2354.
