## 2026-09-01 · born · converted from references.md (check:gha/run-pipefail)
- **Reason:** The behaviour: GitHub's implicit run shell is `bash -e {0}` — **without** `pipefail`
  — so a step piping through another command (`cmd 2>&1 | tee log`) reports the *last* command's
  exit code and a failing command still shows the step green. Setting `defaults.run.shell: bash`
  makes GitHub run the step as `bash --noprofile --norc -eo pipefail {0}`; that exact expansion is
  the fact to re-verify, since it is what makes the remedy work. Converted from
  `git-github-advanced`'s prose in #552, which deletes a paragraph whole once a check covers it —
  the failure message owns the rule and the check's own text owns the remedy, so what is recorded
  here is the platform behaviour the check encodes and the condition that would retire it.
- **Mechanism:** a check
- **Retire when:** Reaffirm against GitHub's documented default and `bash` shell expansion; retire
  only if the implicit shell gains `pipefail`.
