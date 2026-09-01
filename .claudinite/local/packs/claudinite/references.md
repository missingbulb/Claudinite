# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(RULES-1)** Three ad-hoc cross-repo `Verify:` items each parked on a scope denial minutes after
  being picked (#1349, #1351, #1396) — the executor provisions agent sessions with this repo's
  scope only. Retire the rule only if executor sessions gain cross-repo scope.
- **(RULES-2)** Hand-fabricated queue transitions produced an item closed wearing a live status
  (#1220) and one labelled `done` but left open (#1265); `converge-item.mjs` printing the exact
  calls is what makes the sequence reproducible on any session. Retire the rule only if the
  queue's transition is enforced server-side.
- **(RULES-3)** During the #1119 rename sweep, a file rewritten after the sweep started reinvented the
  retired constant as a comparison key, and the state comparison failed silently — a wrong
  count, no error, no failing test. Retire the rule only if a drift guard pins every comparison
  key to its constant.
- **(check:home-seeded-packs-declared)** Baselining lands a seeded pack on every member but is
  gated `!isHome`, so the canon's own declaration is hand-maintained and a newly
  `seededByDefault` pack would reach the whole fleet except this repo, invisibly. Retire the
  check only if baselining stops skipping the home.
