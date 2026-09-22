## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** the owner, 2026-09-13: adoption "should not include turning off other registrars or
  disabling github pages as optional steps, so they need to be evaluated if they are there".
- **Reason:** a workflow that deploys ships the tree with no version cut, no gate and no park lane;
  a `CNAME` file under the published tree is the previous host still claiming the domain. Both are
  leftovers rather than choices.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a check, blocking at high severity, over the repo's workflows and the published
  tree.
- **Rejected:** listing them as adoption steps. A checklist of steps that are no-ops for most
  adopters teaches its reader to skim the list that exists to stop them skimming.
- **Retire when:** the release becomes idempotent against a second publisher.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
