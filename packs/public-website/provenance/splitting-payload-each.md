## 2026-09-18 · born · converted from references.md (RULES-5)
- **Reason:** Content-addressed keys ("name the row by its date and time, not its position in the
  array") survive rows being *added and removed*, which is what they are usually chosen for, and
  **not** a systematic correction to the key itself — a timezone shift, a rounding change, a
  rename — which moves every key at once and joins the two halves to nothing. The join-rate
  assertion is the other half: a missing key returns "no data for this row", indistinguishable from
  a row that genuinely has none yet, so a check written as "at least one row joined" passed at
  **6%**.
- **Mechanism:** prose
