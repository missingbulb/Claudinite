## 2026-08-19 · born · Give every pack file one of the four sanctioned shapes (#1056)
- **Source:** the pack's `RELEASE.md`, the release contract written out when the pack was born
  (#611).
- **Reason:** the contract is content read at one moment in a repo's life, setting a site up or
  debugging its pipeline, which is what a skill is for; as a loose pack file it matched none of the
  four shapes a pack file may take.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a skill, `static-site-releases`, reached by its description.
- **Landed:** #1056 · static-website pack version 3.

## 2026-09-03 · reworded · A skill opens on what to do, not on what the skill is (#1647)
- **Reason:** the body opened by describing itself as the contract. A reader who has loaded a skill
  already knows what it is and needs the act, so the self-describing framing and the pointers to
  prose the reader already holds came out.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1647 · static-website pack version 60903.1.

## 2026-09-03 · trigger-changed · Path-scoped skills: a skill names the files the guard holds edits for until it is loaded (#1650)
- **Reason:** a description-triggered skill is reached only by a session that already suspects it is
  needed, and the files this one governs are exactly where a session that has not read it does
  damage.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `force-load-on-file-edits-paths` over `.github/site.config` and the vendored
  release workflows, so the guard holds an edit there until the skill is loaded.
- **Landed:** #1650 · static-website pack version 60903.2.

## 2026-09-05 · moved · Rules → skills: the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Reason:** the managed-copies rule (the vendored pipeline files are copies of the pack's stubs;
  fix the pack and re-vendor) fires only for a session editing those files, which the skill's own
  path trigger already catches, so every session in every declaring repo was paying for prose that a
  path-forced load delivers exactly when it applies.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule leaves `RULES.md` and becomes a section of this skill, reached by the path
  trigger #1650 gave it.
- **Landed:** #1667 · static-website pack version 60903.3.

## 2026-09-18 · moved · Name the Pages skill for what it does, and cut it to the actions (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** it does not perform a release; it wires, changes and debugs the vendored pipeline that
  does. Halved with the pack it came from: the stage-by-stage narrative of the publish reusable is
  that file's own header comment, and what the pack does and does not own is the README's. What is
  left is the three steps that wire a repo, a table of the four things anyone actually drives it to
  do, and the two facts that surprise people, that the pipeline writes no version of its own and
  that a `GITHUB_TOKEN` push fires no workflow.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** the skill moves to `github-pages` as `github-pages-pipeline`, its description
  naming the moments that want it, its path trigger repointed at the renamed workflows and the
  task's files.
- **Landed:** #2101 · pack version 60917.1.

## 2026-09-22 · trigger-changed · the description was carrying the body's summary, and every session paid for it
- **Reason:** past 60 words the description had stopped being what decides whether to reach for the
  skill and become a precis of the method, which the body already carries and which loads only when
  the skill does.
- **Mechanism:** the trigger half is kept whole — the moments, in the words somebody would use at
  those moments — and the summary half dropped; no force-load path changed, so what the harness
  loads deterministically is untouched and only the model's judgment call reads different text.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
