## 2026-09-01 · born · converted from references.md (generate-project-instructions-1): "Index entries"
- **Reason:** #385 settled that there is no agent-facing corpus index — the corpus map row in the
  repo README is the only place a new pack kind is announced.
- **Mechanism:** a step of the generate-project-instructions skill, a workflow

## 2026-09-21 · trigger-changed · renamed from generate-project-instructions (#2191)
- **Reason:** the name said the deliverable was a project instructions document; the skill's own
  opening says the deliverable is packs, never such a document, and names producing one as the
  failure mode it exists to prevent. With a member-side sibling landing beside it, a session picking
  by name had two chances to mis-reach.
- **Actor:** @missingbulb (owner), choosing the rename over leaving the name alone or deferring it.
- **Model:** claude-opus-5
- **Mechanism:** skill directory, frontmatter `name` and body title renamed together; the skill is
  reached by description, so the rename changes what a session matches on. Its provenance file moved
  with it, keeping one history. The `skillLoads` counts in `usage.GENERATED.json` are a bare map
  with no decode-side rename, so the old name's historical weeks stay under the old key and the new
  name reads as never-loaded until it next loads - left as true history rather than answered with
  rename machinery for one cosmetic discontinuity.
- **Landed:** #2191

## 2026-09-25 · reworded · "baseline" / "baselining" vocabulary retired
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update, and the pack
  every repo declares is basics; the baseline wording named a retired mechanism.
- **Actor:** @missingbulb (owner).
