## 2026-09-14 · born · converted from references.md (git-github-advanced-1)
- **Reason:** GitHub's *Caching dependencies to speed up workflows* doc, "Restrictions for accessing
  a cache" and "Cache access for low-trust workflow triggers": a `pull_request` run's cache is
  created for `refs/pull/.../merge` and restorable only by re-runs of that PR; only `push`,
  `workflow_dispatch`, `repository_dispatch`, `delete`, `registry_package`, `page_build` and
  `schedule` may write the default branch's scope, every other trigger resolving there is read-only
  and a refused save "is reported as a warning in the workflow log"; entries "not accessed in over 7
  days" are removed. Read for #2012, where the read-only case is the executor's own `issues:
  labeled` trigger.
- **Mechanism:** a step of the git-github-advanced skill, a workflow
- **Retire when:** Retire when GitHub drops the low-trust restriction or the 7-day eviction.
