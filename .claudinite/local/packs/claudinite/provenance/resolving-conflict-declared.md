## 2026-09-10 · born · converted from references.md (RULES-84)
- **Reason:** Merging #1815, 2026-09-10 (session cd625226): the branch had sat open since
  2026-09-06, 68 commits behind, and `merge_pull_request` returned `405 Pull Request has merge
  conflicts`. Both `git merge origin/main` and `git rebase origin/main` conflicted in exactly one
  file — `.claudinite/local/packs/claudinite/declared-checks.json` — where `main` had edited a
  neighbouring entry after the branch appended its own, so the whole-file JSON rewrite collided with
  a change the branch had no opinion about. Taking the base file with `git checkout --ours` and
  re-appending the single entry resolved it in one pass; the detour cost ~90s and a merge abort.
  Several auto-merging runs a day append to this file, so the collision is structural.
- **Mechanism:** prose
- **Retire when:** Retire the rule if the file stops being appended by more than one run at a time.
