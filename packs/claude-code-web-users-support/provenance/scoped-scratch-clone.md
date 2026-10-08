## 2026-08-02 · born · a canon fix can be written here but not pushed (#79)
- **Source:** growth extract; #53, #54, #55 and #57 were all defects in the vendored engine and
  packs found from here, and #59 is the shape a patch issue takes.
- **Reason:** work in this repo lands in canon code often, and the escape hatch that worked was the
  tested diff filed as a patch on an issue here for a canon-scoped session.
- **Actor:** the owner.
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Retire when:** a session here gains push scope to the canon repo.
- **Landed:** #79, Refs #71.

## 2026-08-16 · reworded · the dangling "the rule above" cross-reference (#187)
- **Reason:** the pack-adoption rule it pointed at was removed as canon-covered in the same dedup.
- **Actor:** the owner.
- **Model:** Claude, per the commit trailer.
- **Landed:** #187, Refs #23, #174.

## 2026-09-02 · reworded · incident evidence moved out to references.md (#408)
- **Reason:** the incident narrative moved to references.md, following the canon's
  references-convention migration (a member repository); the rule's meaning is unchanged.
- **Actor:** the owner.
- **Model:** Claude, per the commit trailer.
- **Landed:** #408, Refs #402.

## 2026-09-14 · reworded · the 403 is session scope, not organisation policy (#542)
- **Source:** PR #520 tried hard-coding (quote dropped) into a check, and the owner closed it on
  2026-09-13: "This is wrong... 403 happens only when the repo wasn't added to claude code
  sessions."
- **Actor:** the owner.
- **Landed:** #542, Refs #536.

## 2026-09-18 · strengthened · a canon method is filed as a patch only, never also committed locally (#593)
- **Source:** PR #455 (2026-09-10): the learning-a-technology skill was written promotion-ready for
  the canon and still committed as this repo's local-pack skill beside the patch issue #456. The
  owner closed #454 as (quote dropped): a method for authoring
  pack content is fleet knowledge. The local commit was reverted (65df8be) and the skill landed as
  canon a member repository.
- **Actor:** the owner.
- **Mechanism:** a RULES.md rule, beside fix-belongs-canon.
- **Retire when:** a member session gains standing canon push scope, which removes the patch-issue
  workaround this rule protects.
- **Landed:** #593.

## 2026-09-25 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
