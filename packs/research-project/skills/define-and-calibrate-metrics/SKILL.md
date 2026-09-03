---
name: define-and-calibrate-metrics
description: Defining a reported metric and keeping its history comparable — a definition change is the owner's call and re-measures the history, and raw quantities compare only inside one calibration read off each input. Use when defining, redefining, aggregating or comparing a reported metric across inputs.
---

# Define and calibrate metrics

## A metric's definition is part of its identity

Write down what each reported metric actually counts, and treat **re-defining
one as the owner's call, never a tuning step**. A definition change is uniquely
silent: the column keeps its name and its units, so every number ever recorded
under it *looks* comparable while the quantity underneath has moved. When a
definition does change, the history is **re-measured, never re-labelled** — rerun
the old inputs under the new definition, or mark the old numbers as belonging to
the old one. Carrying both definitions' numbers in one series under one name is
the failure this rule exists to prevent.

## A raw measurement is comparable only inside one calibration

When each input carries its own scale (a per-image conversion factor, a per-run
sampling rate, a per-source unit), a raw absolute quantity means something
different in every input. **Aggregate and compare only normalized quantities** —
a density, a ratio, a per-unit rate — never the raw number, and never a mean
spanning two sources that differ in more than scale (a different instrument,
subject or protocol changes *what* is measured, not just how much of it fits in
frame). Group the rollup by source and say what the grouping is for.

The conversion factor is a **measurement of that input**, not a constant: read it
off the input itself, never infer it from a stated setting or borrow it from a
neighbour. It lives in exactly one place in the code — a second copy is a second
calibration, and whichever copy a given script happens to read wins silently. An
input offering nothing to measure the factor from is **not** quietly dropped:
mark it uncalibrated *with the reason*, report only its scale-free quantities,
and leave it visible as a known gap.
