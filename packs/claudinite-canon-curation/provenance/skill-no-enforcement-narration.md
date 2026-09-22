## 2026-07-19 · born · google-identity: prose to skill-owned checks, enforcement-silent canon docs (#350)
- **Source:** the same change's own skills. `google-id-token-validation`'s SKILL.md carried a
  run-the-sweep instruction and a list of its rule ids, and `unattended-agents` carried "enforced by
  the ... check" clauses.
- **Reason:** checks run on their own at every Stop and in CI and each failure message carries its
  rule, so a skill narrating its enforcement duplicates the mechanism and springs the drift trap -
  the narration goes stale while the mechanism moves on.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a check owned by the new `writing-claudinite-skills` skill, since corpus-skill
  authoring is canon-home activity: a `SKILL.md` may name neither the checks runner path nor any
  rule id a sibling module in its own directory defines, ids matched on kebab boundaries so one
  never matches inside a longer name.
- **Landed:** #350 (Refs #303).

## 2026-07-29 · scope-changed · it was matching zero files (#560)
- **Source:** #552, where a human read an enforcement-narration paragraph in `adopt-pack` that the
  check should have caught.
- **Reason:** it scanned `^skills/<name>/SKILL.md$`, the pre-#385 root-level layout. Skills have
  lived inside their owning pack since, so the pattern matched nothing in any tree while the check
  read as live - and its fixtures spelled the same dead layout, five green tests over a scan with no
  inputs, which is why the suite never noticed. 21 skills in scope, up from 0.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the scan anchors on `(^|/)packs/<pack>/skills/<name>/SKILL.md$`, the leading
  `(^|/)` spanning the canon shelf and a repo's local packs, and `packs/` rather than a bare
  `skills/` keeping a mounted `.claude/skills/` copy out. Fixtures rewritten to the real layout,
  with a local-pack case and a negative for the mounted copy.
- **Landed:** #560 (Refs #563, #551).

## 2026-09-01 · scope-changed · the path anchor becomes the whole gate (#1541)
- **Reason:** it arrived on the shelf with the pack's promotion out of the home's local packs, and
  the separate gate on the skills registry being tracked had become redundant: the anchor already
  names a shelf, which no repo without one has.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the `ctx.tracked` gate is dropped and the path anchor carries the relevance alone.
- **Landed:** #1541.
