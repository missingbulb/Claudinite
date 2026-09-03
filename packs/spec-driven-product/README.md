# spec-driven-product pack

A project-class pack (declared — no fingerprint) for the recurring class: build and ship a
small end-user product against an executable spec — every requirement a numbered leaf claimed by
exactly one right-kind proof, expected results owner-owned, releases automatic while `main` is green.
Its enforcement deliberately lives inside the declaring project (the committed coverage gate and
allowlist the playbook requires), so the pack itself ships no checks; the sections are loop and
judgment, kept as prose and two skills.

Distilled from the two worked examples of the class in the owner's fleet:
missingbulb/GoogleCalendarEventCreator's executable-requirements methodology (`dev/requirements/` —
the origin) and missingbulb/TLDR's adaptation of it (`dev/requirements/`,
`dev/docs/ui-testing-guideline.md`, which adds the cross-tier server kind). The general test-trust
rules both build on are corpus canon already, and are pointed to rather than restated here.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| One numbered document states the product | medium | complexity | prose: 38 words |
| A leaf is what the harness asserts | medium | complexity | prose: 67 words |
| Every leaf carries a stable id. | high | complexity | prose: 33 words |
| Doc-first, red by default. | high | correctness | prose: 21 words |
| The spec drives the tests | high | correctness | prose: 54 words |
| Enforce the bijection with a coverage gate | high | correctness | prose: 42 words |
| A kind is one way to assert | low | complexity | prose: 48 words |
| A kind may be a singleton. | low | complexity | prose: 37 words |
| Give each kind's runner a named lane | medium | performance | prose: 44 words |
| Actuals come from the real code. | high | correctness | prose: 38 words |
| Committed expecteds are the owner's approval record | high | correctness | prose: 22 words |
| The contract takes two honest shapes. | medium | complexity | prose: 75 words |
| On a mismatch, surface both and ask | high | correctness | prose: 49 words |
| Expected changes ride the normal review flow | high | correctness | prose: 29 words |
| One rule, sibling leaves per enforcing tier | medium | complexity | prose: 46 words |
| Prove a rule where it is enforced | medium | correctness | prose: 45 words |
| Name what the harness cannot reach | high | correctness | prose: 78 words |
| Embed regenerated renders in the spec | medium | complexity | prose: 40 words |
| Regenerate, never hand-edit. | high | correctness | prose: 25 words |
| main is always releasable, automation releases | high | correctness | prose: 53 words |
| The version users see moves deliberately. | medium | correctness | prose: 48 words |

The supported-targets matrix (§5) is the [`add-a-supported-target`](skills/add-a-supported-target/SKILL.md)
skill and the deliberate-gap allowlist rule is
[`mark-a-verification-gap`](skills/mark-a-verification-gap/SKILL.md). The deterministic golden-image
method the gallery leans on is canon in the writing-tests skill — matching the render engine to the
surface (a bit-exact rasterizer for inline-styled/SVG surfaces, a headless browser for pages that use
grid/vars/emoji/form-widgets), bundled fonts, capturing a host-page surface with styles inlined, and a
drift gate on the embedded gallery.

## Skills

| Skill | Trigger |
|---|---|
| [`add-a-supported-target`](skills/add-a-supported-target/SKILL.md) | adding, dropping or changing a supported site, format, provider or locale |
| [`mark-a-verification-gap`](skills/mark-a-verification-gap/SKILL.md) | a requirement the harness can't faithfully verify yet, or shrinking the gap allowlist |
