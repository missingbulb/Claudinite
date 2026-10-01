## 2026-09-25 · born · a captured PR #697 session mis-debugged a phantom test failure (#761)
- **Source:** conversation-logs `2026-09-25T1525Z--pr-697--…jsonl`; reproduced live (`node --test
  <dir>` → 1 fail, `MODULE_NOT_FOUND`, no suite discovery) on Node v22.22.2.
- **Reason:** the session read the misleading single "test failed" as a real regression before
  noticing the directory-vs-glob mistake, costing a debugging detour on every future run that
  repeats it.
- **Actor:** growth-extract task, running as work item #761.
- **Model:** claude-sonnet-5.
- **Mechanism:** an action-scope guardToolCalls check on Bash — matches `node --test <path ending
  in />`, quiet on explicit files, globs or no args.

## 2026-09-26 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
