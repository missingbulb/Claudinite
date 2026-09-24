## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the corpus was reorganized into two homes selected by WHEN a rule is active, and this
  pack is the one that is active in every session: cross-project working discipline, the task
  lifecycle, and the baseline engineering practice, whatever technology is running.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a pack named `universal`, carrying `RULES.md` prose injected at session start and
  the checks that back it, discovered by a directory scan so there is no list to maintain.
- **Landed:** #128, closing #127 and #131.

## 2026-07-11 · scope-changed · No pack is active by default - the basics pack (né universal) is declared explicitly (#232)
- **Reason:** "universal" named a default nothing should have: a project says which packs it runs.
  The pack is never fingerprinted either, because the declaration is authoritative and dropping it
  is a deliberate choice rather than drift to detect.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the id becomes `basics`, and activation is the project's
  `.claudinite-settings.json` declaration, seeded by bootstrap and backfilled into existing
  consumers by the nightly update.
- **Landed:** #232.

## 2026-07-11 · scope-changed · Package-driven skills: packs declare skills, mounts generated at session start (#234)
- **Reason:** a skill is content a pack contributes, like its prose and its checks, rather than a
  tree the engine owns.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest declares the pack's skills and the session-start mount is generated
  from that declaration.
- **Landed:** #234.

## 2026-07-12 · scope-changed · Pack dependencies at baselining; settings validation replaces pack-declaration (#244)
- **Reason:** this pack is declared everywhere, so its `requires` closure is what puts another
  pack's rules in front of every session.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a `requires` list on the manifest, materialized into the member's declaration.
- **Landed:** #244.

## 2026-07-21 · scope-changed · Vendored-mount surface shrink: engine/ consolidation, skills into packs (#384)
- **Reason:** a skill that every project's work can call for belongs to the pack every project
  declares; one that stops being a baseline activity moves to the pack whose projects need it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `skills/` moves inside the pack directory, mounted wherever the pack is declared.
- **Landed:** #384.

## 2026-08-06 · scope-changed · Move engineering-practices from a skill into basics/RULES.md (#661)
- **Reason:** the engineering-practices bullets were baseline discipline every session needs, not an
  activity a session reaches for, so a skill was the wrong rung.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the skill's content becomes `RULES.md` prose and the skill directory goes.
- **Landed:** #661.

## 2026-08-21 · scope-changed · The version bump belongs to the change, not to the release flow (#1151)
- **Actor:** @missingbulb (owner).
- **Mechanism:** the `bump-version` skill leaves this pack with the release flow it served.
- **Landed:** #1151.

## 2026-09-04 · scope-changed · Absorb barriers into basics, and stop it interviewing on adoption (#1684)
- **Reason:** no project ever chose the `barriers` pack; it rode in on this pack's `requires`
  closure, and a separate identity for a mechanism everyone already has bought only a second catalog
  row and an adoption question nobody had asked for.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the `barrier` rule and the contribution seam move onto this manifest, with the
  `contributes: { barriers: [...] }` key keeping its name because it names the mechanism rather than
  the pack that used to house it.
- **Landed:** #1684.

## 2026-09-07 · scope-changed · Retire the tidy-repo pack; absorb improve-comments into basics (#1842)
- **Reason:** tidy-repo's issue and PR sweeps had been outgrown and the comment pass was the one
  dimension left, which is baseline housekeeping with no second declaration to earn.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the `improve-comments` task and skill, and the `improve-comments-scope` gate, move
  onto this pack.
- **Landed:** #1842.
