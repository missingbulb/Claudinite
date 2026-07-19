---
name: writing-claudinite-skills
description: Authoring or changing a skill in the Claudinite corpus — SKILL.md conventions, where a skill's checks and tests live, catalog and pack wiring. Use when creating or editing skills/<name>/ in the canon; a consumer project's own agent docs are authoring-agent-docs' turf.
---

# Writing Claudinite skills

A corpus skill is a harness-matched trigger (frontmatter `name` + a tight `description`) plus the body the agent needs at usage time — well under 500 lines, and nothing a deterministic mechanism could carry instead (the promotion ladder in [checks/DESIGN.md](../../checks/DESIGN.md) decides). A skill may own the rules that validate its action — `checks.mjs` beside the SKILL.md, one module per rule, fixture tests beside them; shape and the relevance-first gate in [checks/README.md](../../checks/README.md#adding-a-rule). Wire ownership: some pack's `skills` list plus a row in [skills/README.md](../README.md). Instruction-writing *quality* — how agents actually follow docs — is [authoring-agent-docs](../authoring-agent-docs/SKILL.md)' turf; this skill is the corpus mechanics.
