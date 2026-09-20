## 2026-09-05 · born · converted from references.md (firestore-security-rules-5)
- **Reason:** The point of pinning to `request.time` is that a client must not be able to forge a
  heartbeat time — the value is a claim about the world, so the server must be the one to make it.
  Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a
  rule rather than enabling it”, before this pack had a references.md to hold it).
- **Mechanism:** prose, a guideline of the firestore-security-rules skill
- **Retire when:** Reaffirm while clients can write the field; retire if the field moves server-side
  entirely.
