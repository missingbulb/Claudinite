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
