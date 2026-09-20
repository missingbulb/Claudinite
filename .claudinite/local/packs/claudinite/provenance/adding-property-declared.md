## 2026-09-13 · born · converted from references.md (RULES-87)
- **Reason:** #1951, 2026-09-13: an unshipped `pr_name` field refused to be declared beside
  `automerge` other than `"nothing"`, beside `supersede_existing_pr`, and beside `no_code_changes`
  — three restrictions reasoned from what a pull request two tasks shared might do to a sibling
  task's work, none of them asked for. The owner's correction: the properties are orthogonal, a pull
  request tries to auto-merge regardless and simply stays open when its policy does not cover the
  diff, and an interaction between properties is the owner's call to permit rather than the author's
  to infer. The next cut rebuilt the same coupling in prose — a schema description stating the new
  field meant one standing pull request, true only beside `amend_existing_or_create_new_pr` — so
  the rule reaches the description as well as the validator. Scoped to NEW properties because the
  contract already carries three grandfathered pairs, named in the rule. The field itself was
  dropped (#1950) for having no user; the rule is what the episode was worth.
- **Mechanism:** prose
- **Retire when:** Retire the rule if a property is introduced whose legal values genuinely cannot
  be enumerated without a sibling's.
