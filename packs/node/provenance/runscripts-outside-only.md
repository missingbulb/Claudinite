## 2026-09-01 · born · converted from references.md (RULES-2)
- **Reason:** Verified in this session against jsdom 30.0.1 on Node v22.22.2. Parsing `<div
  id=x>A<noscript><b>NO</b></noscript>B</div>`: under the default `runScripts` the `<noscript>` was
  parsed into live DOM (one child element) and `textContent` read a clean `"ANOB"`; under
  `runScripts: "dangerously"` the `<noscript>` was kept as raw text (zero child elements) and
  `textContent` read `"A<b>NO</b>B"` — the markup splicing into the value that a real browser
  produces. The default is the opposite of a browser, and the test-passes/production-fails asymmetry
  is confirmed in both directions. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as
  “consequence prose arguing for a rule rather than enabling it”, before this pack had a
  references.md to hold it).
- **Mechanism:** prose
