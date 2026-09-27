## 2026-09-27 · born · a per-call hook change is measured in the session that makes it (#2354)
- **Source:** the `claudinite-growth/prose-to-checks-sweep` run on work item #2354, converting the
  measurement half of `changing-call-hook`. The rule predates
  `docs/declarative-checks/rule-inventory.md`'s classification, so no row had judged it.
- **Mechanism:** a coded work rule, because the condition is two things at once - the change's own
  files and whether this session ran `dev/tools/hook-latency.mjs` - and no declared key reads the
  transcript. The evidence is any tool call naming the module: the before-run and the after-run are
  one measurement to the rule, which makes no claim about their order or their numbers, so a false
  clear costs one unmeasured change where a false finding would fire on every hook edit.
- **Reason:** these modules are spawned once per tool call, prompt and result, so a cost added to
  one is paid by every session in every member and is invisible in the diff.
- **Rejected:** `block` - the growth ladder's rung 3 ships one advisory from an unattended run.
- **Retire when:** the harness runs hooks in-process, or the per-call hooks are gone (as for
  `changing-call-hook` itself).
- **Actor:** the `claudinite-growth/prose-to-checks-sweep` run on work item #2354.
