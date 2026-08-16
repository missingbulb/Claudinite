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

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| One numbered requirements document states what the product must do | 38 | medium | complexity | prose |
| Keep the spec's boundary crisp: a leaf is what the harness can assert. | 67 | medium | complexity | prose |
| Every leaf carries a stable id. | 32 | high | complexity | prose |
| Doc-first, red by default. | 20 | high | correctness | prose |
| The spec drives the tests, never the other way around. | 54 | high | correctness | prose |
| Enforce the bijection with a committed coverage gate | 42 | high | correctness | prose |
| A kind is one way a requirement can be asserted | 47 | low | complexity | prose |
| A kind may be a singleton. | 37 | low | complexity | prose |
| Give each kind's runner a named lane, and keep the default lane fast and deterministic. | 44 | medium | performance | prose |
| Actuals come from the real code. | 38 | high | correctness | prose |
| The committed expecteds are the owner's approval record of the product. | 21 | high | correctness | prose |
| The contract takes two honest shapes. | 75 | medium | complexity | prose |
| On a mismatch, surface actual vs. expected (and the diff) and ask. | 48 | high | correctness | prose |
| Expected changes ride the normal review flow | 29 | high | correctness | prose |
| A product rule with more than one enforcing tier gets sibling leaves under one statement | 46 | medium | complexity | prose |
| The proof lives where the rule is actually enforced. | 45 | medium | correctness | prose |
| When part of the product's value is breadth over external targets | 40 | medium | complexity | prose |
| Prove each target against a committed, real sample of it | 56 | high | correctness | prose |
| Adding a target is a documented, repeatable flow | 22 | low | complexity | prose |
| Say what the harness cannot reach, naming the exact boundary of each stub. | 78 | high | correctness | prose |
| Deliberate gaps are marked at the leaf and committed, never remembered. | 79 | high | correctness | prose |
| Embed regenerated renders of the real states in the spec itself | 40 | medium | complexity | prose |
| Regenerate, never hand-edit. | 24 | high | correctness | prose |
| The deterministic golden-image method this leans on is canon in the writing-tests skill | 53 | low | complexity | prose |
| main is releasable at all times, and automation does the releasing | 53 | high | correctness | prose |
| The version users see moves deliberately. | 48 | medium | correctness | prose |
