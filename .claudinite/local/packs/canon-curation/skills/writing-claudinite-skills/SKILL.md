---
name: writing-claudinite-skills
description: Authoring or changing a skill in the Claudinite corpus — SKILL.md conventions, where a skill's checks and tests live, catalog and pack wiring. Use when creating or editing a pack's skills/<name>/ in the canon; a consumer project's own agent docs are authoring-agent-docs' turf.
---

# Writing Claudinite skills

A corpus skill is a harness-matched trigger (frontmatter `name` + a tight `description`) plus the body the agent needs at usage time — well under 500 lines, and nothing a deterministic mechanism could carry instead (the promotion ladder in [engine/checks/DESIGN.md](../../../../../../engine/checks/DESIGN.md) decides). A skill may own the rules that validate its action — `checks.mjs` beside the SKILL.md, one module per rule, fixture tests beside them; shape and the relevance-first gate in [engine/checks/README.md](../../../../../../engine/checks/README.md#adding-a-rule). Ownership is placement: the skill lives in exactly one owning pack's `skills/` (#385) — there is no skill catalog; the pack's own README names what it bundles. Instruction-writing *quality* — how agents actually follow docs — is [authoring-agent-docs](../../../../../../packs/basics/skills/authoring-agent-docs/SKILL.md)' turf; this skill is the corpus mechanics.
