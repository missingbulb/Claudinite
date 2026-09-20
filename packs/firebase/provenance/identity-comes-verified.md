## 2026-09-01 · born · converted from references.md (RULES-2)
- **Reason:** Anything the client sends about who they are is decoration: the body is
  attacker-controlled, so only the verified token carries identity. Recovered from the rule's own
  pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm as long as rules can read `request.auth`; retire only if identity stops
  being available there.
