## 2026-09-05 · born · converted from references.md (firebase-functions-6)
- **Reason:** A build that emits an entrypoint which throws on `require` is invisible until
  something invokes it, and the suite is the cheapest place to see it. Recovered from the rule's own
  pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it).
- **Mechanism:** prose, a guideline of the firebase-functions skill
- **Retire when:** Reaffirm while functions are deployed from a built directory; retire if the
  deploy itself smoke-loads.
