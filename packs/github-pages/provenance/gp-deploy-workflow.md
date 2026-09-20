## 2026-09-18 · born · converted from references.md (check:gp/deploy-workflow)
- **Reason:** The deploy runs from the repo's own `.github/` because GitHub runs a Pages deploy only
  from a workflow job in the repo's own tree, never from the mount — so the pack holds the
  template and each repo hosts a managed copy. The check holds the copy present, dispatch-only and
  current, and holds every other workflow off the Pages actions, because a second publisher or a
  push trigger deploys a tree with no version cut and no park lane, and its green run looks exactly
  like success.
- **Mechanism:** a check
- **Retire when:** Retire it if the vendored surface is ever replaced by something the member cannot
  hold a stale copy of.
