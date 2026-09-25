## 2026-07-02 · born · Add separation-of-concerns rule for documentation (#85)
- **Reason:** copying B's mechanism into A springs the same drift trap as any duplicated source of
  truth, with nothing to catch it when B changes.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose; it covers code comments and Markdown alike, which no single file scope could
  gate.
- **Landed:** #85.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Writing file A so it depends on file B".
- **Landed:** #760, closing #759 · pack version 1.
