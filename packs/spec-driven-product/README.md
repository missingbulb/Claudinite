# spec-driven-product pack

A project-class pack (prose-only, declared — no fingerprint) for the recurring class: build and ship a
small end-user product against an executable spec — every requirement a numbered leaf claimed by
exactly one right-kind proof, expected results owner-owned, releases automatic while `main` is green.
Its enforcement deliberately lives inside the declaring project (the committed coverage gate and
allowlist the playbook requires), so the pack itself ships no checks; the sections are loop and
judgment, kept as prose.

Distilled from the two worked examples of the class in the owner's fleet:
missingbulb/GoogleCalendarEventCreator's executable-requirements methodology (`dev/requirements/` —
the origin) and missingbulb/TLDR's adaptation of it (`dev/requirements/`,
`dev/docs/ui-testing-guideline.md`, which adds the cross-tier server kind). The general test-trust
rules both build on are corpus canon in [the writing-tests skill](../basics/skills/writing-tests/SKILL.md)
and are pointed to, not restated.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| One numbered requirements document states what the product must do | medium | complexity | prose: 38 words |
| Keep the spec's boundary crisp: a leaf is what the harness can assert. | medium | complexity | prose: 67 words |
| Every leaf carries a stable id. | high | complexity | prose: 32 words |
| Doc-first, red by default. | high | correctness | prose: 20 words |
| The spec drives the tests, never the other way around. | high | correctness | prose: 54 words |
| Enforce the bijection with a committed coverage gate | high | correctness | prose: 42 words |
| A kind is one way a requirement can be asserted | low | complexity | prose: 47 words |
| A kind may be a singleton. | low | complexity | prose: 37 words |
| Give each kind's runner a named lane, and keep the default lane fast and deterministic. | medium | performance | prose: 44 words |
| Actuals come from the real code. | high | correctness | prose: 38 words |
| The committed expecteds are the owner's approval record of the product. | high | correctness | prose: 21 words |
| The contract takes two honest shapes. | medium | complexity | prose: 75 words |
| On a mismatch, surface actual vs. expected (and the diff) and ask. | high | correctness | prose: 48 words |
| Expected changes ride the normal review flow | high | correctness | prose: 29 words |
| A product rule with more than one enforcing tier gets sibling leaves under one statement | medium | complexity | prose: 46 words |
| The proof lives where the rule is actually enforced. | medium | correctness | prose: 45 words |
| When part of the product's value is breadth over external targets | medium | complexity | prose: 40 words |
| Prove each target against a committed, real sample of it | high | correctness | prose: 56 words |
| Adding a target is a documented, repeatable flow | low | complexity | prose: 22 words |
| Say what the harness cannot reach, naming the exact boundary of each stub. | high | correctness | prose: 78 words |
| Deliberate gaps are marked at the leaf and committed, never remembered. | high | correctness | prose: 79 words |
| Embed regenerated renders of the real states in the spec itself | medium | complexity | prose: 40 words |
| Regenerate, never hand-edit. | high | correctness | prose: 24 words |
| The deterministic golden-image method this leans on is canon in the writing-tests skill | low | complexity | prose: 53 words |
| main is releasable at all times, and automation does the releasing | high | correctness | prose: 53 words |
| The version users see moves deliberately. | medium | correctness | prose: 48 words |
