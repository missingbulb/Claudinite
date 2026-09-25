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

## 2026-09-21 · strengthened · the check settles the half of the expectation a file can (#2214)
- **Source:** the usage vocabulary losing its rate keys (#2214), and the sweep that set 17 skills to
  a bulk default the owner caught on the first one they opened.
- **Reason:** with the rate gone the check had only a closed set to police, which a typo breaks and
  nothing else. `triggered` claims the skill's own force-load declarations are when it loads, and a
  skill declaring none has no such moments - a claim its own file contradicts, and the one half of
  an expectation a check can settle rather than take on trust.
- **Mechanism:** the same blocking check, widened; the converse is deliberately NOT a fault, since a
  skill may carry a trigger and still expect most loads by judgment, which is a real claim about
  itself rather than a contradiction.
- **Landed:** #2214

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · reworded · task-only skills hide their description
- **Reason:** nothing told an author that a skill no session picks by judgment can leave the
  listing.
- **Actor:** @missingbulb (owner).
