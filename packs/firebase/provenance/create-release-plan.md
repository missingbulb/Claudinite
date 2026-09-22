## 2026-08-20 · born · Collapse firebase-release into firebase, as the create-release-plan skill (#1081)
- **Source:** the firebase-release pack, registered beside this one in #165: the dev/prod standard
  decided for Firebase in missingbulb/ShoutsAndWhispers from missingbulb/TLDR's worked AWS split.
- **Reason:** a second pack a project declared once it decided it was ready to ship is a fact about
  a milestone kept as a fact about configuration. The content is read at one moment in a project's
  life, which is what a skill is for, so it moved into the pack that owns the technology - the
  dev/prod project split, pipeline-injected prod config, the App Check gate and the promotion
  cadence, loaded when a release is being planned rather than declared in advance.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a skill of this pack, reached by its description when a project plans a release.
- **Retire when:** the standard was decided ahead of first exercise and no project has run a release
  through it; expect refinement, and conformance checks, once one does.
- **Landed:** #1081 (Closes #1079) · pack version 4.

## 2026-09-03 · reworded · A skill opens on what to do, not on what the skill is (#1647)
- **Reason:** the skill opened on self-description and on where it came from. A reader who loaded it
  did so deliberately and already holds its frontmatter description, and the pack README carries the
  provenance - checked before it was removed. No procedure or decision point was touched.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1647 (Closes #1646) · pack version 60903.1.

## 2026-09-05 · trigger-changed · the skill gains the deploy layout and a path trigger (#1667)
- **Reason:** the deploy-layout rules - a self-contained project root, committed `.firebaserc`
  aliases - are needed when `firebase.json` or `.firebaserc` is being edited, which is a moment a
  path glob predicts. Adding the paths to the skill that already owned the release decision kept the
  deploy surface in one place rather than minting a third skill for two rules.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the skill keeps its description trigger and gains `force-load-on-file-edits-paths`
  for `firebase.json` and `.firebaserc`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.

## 2026-09-22 · trigger-changed · the description was carrying the body's summary, and every session paid for it
- **Reason:** past 60 words the description had stopped being what decides whether to reach for the
  skill and become a precis of the method, which the body already carries and which loads only when
  the skill does.
- **Mechanism:** the trigger half is kept whole — the moments, in the words somebody would use at
  those moments — and the summary half dropped; no force-load path changed, so what the harness
  loads deterministically is untouched and only the model's judgment call reads different text.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
