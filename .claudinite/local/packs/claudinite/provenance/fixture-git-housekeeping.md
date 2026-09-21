## 2026-09-21 · born · a test that inits its own git fixture keeps git's housekeeping in the foreground
- **Source:** 328ee0c (#2183), repeated in 0ebc709 (#2185); the invariant itself is #235, in
  engine-tests/helpers.mjs.
- **Reason:** two pack-update tests inited and committed a member fixture with a bare execFileSync,
  so git's auto-gc detached and the fixture's removal raced it. CI on #2180 failed with ENOTEMPTY
  under .git while every test passed, spending a diagnostic cycle on a pull request whose own diff
  was innocent. The helper env has held the invariant since #235 and nothing enforced it, so a new
  fixture reintroduces the race simply by writing its spawn out by hand. Twelve test files still
  spawn their own git as the grace opens; removeTree's retry is the second line of defense behind
  them.
- **Actor:** the claudinite-growth/growth-extract run on work item #2196.
- **Model:** claude-opus-5
- **Mechanism:** a declared world check over tracked *.test.mjs, relevant where a file both spawns
  git and names an init or a clone, requiring gc.autoDetach in that same file. The condition is a
  whole file's rather than a line's: the spawn is usually a wrapper and the subcommand reaches it as
  an argument, so a line-scoped rule reads the wrapper as harmless.
- **Retire when:** no test builds a git fixture without the shared runner, or git stops detaching
  its housekeeping.
