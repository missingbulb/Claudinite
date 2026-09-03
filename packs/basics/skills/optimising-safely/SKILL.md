---
name: optimising-safely
description: Proving an optimisation preserves behaviour — hashed full outputs of both paths across every branch, fuzzed inputs, a bit-identical match — or leaving the path alone. Use when optimising code that is meant to behave exactly as before.
---

# Optimising safely

- **Optimising** — if the change is meant to preserve behaviour, prove it: hash the full outputs
  of both paths across every branch, fuzzing the inputs that select each, and accept only a
  bit-identical match. If the correctness risk outweighs the speed-up, leave the path alone and
  record that as a deliberate call.
