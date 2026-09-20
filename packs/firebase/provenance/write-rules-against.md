## 2026-09-05 · born · converted from references.md (firestore-security-rules-1)
- **Reason:** The create/merge asymmetry was recorded as the single most common way a
  correct-looking ruleset rejects every legitimate client write — a frequency claim, which is what
  earns the rule its place over the many other ruleset mistakes available. Recovered from the rule's
  own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it).
- **Mechanism:** prose, a guideline of the firestore-security-rules skill
- **Retire when:** Reaffirm if merge-shaped writes are still the dominant client pattern; retire if
  the project's clients stop using `set(merge: true)`/`update`.
