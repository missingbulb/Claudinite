## 2026-09-05 · born · converted from references.md (firestore-security-rules-3)
- **Reason:** Reading rules and believing them is how the merge-semantics bugs of RULES-1 ship —
  the empirical-testing rule exists because rule review by inspection is what failed. Recovered from
  the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather
  than enabling it”, before this pack had a references.md to hold it).
- **Mechanism:** prose, a guideline of the firestore-security-rules skill
- **Retire when:** Reaffirm while the emulator can execute rules; retire if it cannot.
