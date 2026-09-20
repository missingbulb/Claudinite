## 2026-09-01 · born · converted from references.md (RULES-1)
- **Reason:** Verified in this session against jsdom 30.0.1 on Node v22.22.2:
  `document.body.innerText` came back `undefined` — falsy, so `el.innerText || el.textContent`
  does fall through to `textContent` exactly as the rule describes, and a visible-text scrape can
  pass under test while finding nothing or the wrong thing in Chrome. **Precision note for a future
  review**: the value is `undefined`, not `null` as the rule's wording says; the behaviour the rule
  turns on is unaffected. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as
  “consequence prose arguing for a rule rather than enabling it”, before this pack had a
  references.md to hold it).
- **Mechanism:** prose
