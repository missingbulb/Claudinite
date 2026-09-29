## 2026-09-29 · born · a codemod's own "identical before and after" proof read the cache, not the rewrite
- **Source:** capture 2026-09-28, session 3ef6afc6-df10-51c5-acc6-51ff234e3308 (#2382), where a
  script rewriting every pack manifest's regex literals was split into a dump mode and a rewrite
  mode after the in-process re-read was spotted as cached.
- **Reason:** the failure is silent and inverted - the proof reports identical precisely when it
  compared the old module with itself, so a broken rewrite reads as safe.
- **Actor:** the claudinite-growth/growth-extract run on #2398.
- **Model:** claude-opus-5
- **Mechanism:** prose, in the local pack's proving-a-change rules beside verifying-bulk-file; the
  scripts that carry the trap are scratchpad ones no check scans.
- **Retire when:** the sweeps this repo runs over its own .mjs sources stop proving themselves by
  loading the tree before and after.
