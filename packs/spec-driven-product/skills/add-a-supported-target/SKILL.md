---
name: add-a-supported-target
description: How a supported external target — a site, file format, provider or locale — enters the executable spec as its own leaf, proven against a committed real sample. Use when adding, dropping or changing a supported target.
---

# Adding a supported target

- **When part of the product's value is breadth over external targets** — supported sites, file
  formats, providers, locales — each supported target is its own leaf, so dropping a target is a
  visible spec change, not a silent regression.

- **Prove each target against a committed, real sample of it** (a captured page, a genuine file), with
  the owner-reviewed exact-values expectation committed beside it — capture the sample first and read
  the expecteds off the committed bytes (canon in the writing-tests skill). A hand-invented sample
  proves support for a target the world doesn't actually serve.

- **Adding a target is a documented, repeatable flow** that lands the new leaf, its real sample, and
  its reviewed expected together.
