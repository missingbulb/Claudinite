---
name: user-data-disclosure
description: Keeping the permission string, privacy policy and store listing in step with what the software does with a user's data. Use when a change retains something new, opens a listener, adds an outbound connection or otherwise changes what the software does with user data.
---

# User-data disclosure

- **Changing what the software does with a user's data** — the permission string, privacy
  policy and store listing are part of the contract, so change them in the same commit.
  Retaining something new, opening a listener or adding an outbound connection changes the
  promise rather than adding a field: decide it explicitly and rewrite the disclosure before the
  code. Expect the claim in more than one place — grep the whole surface for the standing
  absolutes it touches ("no tracking", "no cookies", "no external assets") and reconcile every
  hit.
