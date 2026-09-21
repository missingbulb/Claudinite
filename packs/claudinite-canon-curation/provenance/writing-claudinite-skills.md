## 2026-09-01 · born · converted from references.md (writing-claudinite-skills-1)
- **Reason:** #385 settled that there is no skill catalog and no agent-facing corpus index:
  placement in the owning pack's `skills/` is the registration, and the pack README names what it
  bundles.
- **Mechanism:** a step of the writing-claudinite-skills skill, a workflow

## 2026-09-21 · born · the skill gains a check that a usage expectation is declared (#2214)
- **Source:** docs/usage-review/DESIGN.md §2, the owner's design of 2026-09-21.
- **Reason:** the harness never reads frontmatter `metadata`, so a missing or mis-declared `usage`
  block is silent - the usage review would list the skill as unstated a month later and a reader
  would have no way to tell a deliberate silence from a typo. Caught at authoring time instead,
  through the same reader the review uses, so the check and the review can never disagree about what
  a block says.
- **Mechanism:** a blocking check owned by this skill, carrying a `since` so a member's vendored
  skills have a window to converge before it turns red. It reads the engine through a namespace
  probe rather than named imports, because the reader is newer than this pack's delivery of the
  check and the two lanes ship apart.
- **Retire when:** every skill on every shelf carries a block and the review's `unstated` list has
  been empty for two months - the check is then holding a convention nobody breaks.
- **Landed:** #2214
