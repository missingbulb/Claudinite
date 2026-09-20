## 2026-09-01 · born · converted from references.md (RULES-1)
- **Reason:** Verified in this session against jsdom 30.0.1 on Node v22.22.2, across all four
  injection paths. The `<p>` is auto-closed and the block lands as its `nextElementSibling` wherever
  the two are parsed together: document parsing and `DOMParser` both yield
  `<p>before</p><div>injected</div><p></p>`, as does `innerHTML` on an **ancestor**; with no text
  before the block the `<p>` is left with `textContent === ""`, silently and with no error — the
  read the rule warns about. Writing *into* an already-parsed `<p>` does NOT auto-close: both
  `p.innerHTML = '<div>…</div>'` and `p.insertAdjacentHTML('beforeend', …)` left the `<div>`
  nested with `nextElementSibling` null. That is spec-correct — in the fragment parsing algorithm
  the context element is not on the stack of open elements, so the `<div>` start tag never sees a
  `p` in button scope — so it holds in real browsers, not just jsdom. The rule as recovered named
  `innerHTML` and `dangerouslySetInnerHTML` as its trigger, which is the one path that does not
  produce the behaviour; it was corrected in the same change on the owner's call, to key on whether
  the `<p>` and the block are parsed together. Recovered from the rule's own pre-#467 text (cut by
  2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this pack
  had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm against the HTML fragment parsing algorithm; retire only if the content
  model stops disallowing block content in `<p>`.
