# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** Verified in this session against jsdom 30.0.1 on Node v22.22.2, across all four
  injection paths. The `<p>` is auto-closed and the block lands as its `nextElementSibling`
  wherever the two are parsed together: document parsing and `DOMParser` both yield
  `<p>before</p><div>injected</div><p></p>`, as does `innerHTML` on an **ancestor**; with no
  text before the block the `<p>` is left with `textContent === ""`, silently and with no error
  — the read the rule warns about. Writing *into* an already-parsed `<p>` does NOT auto-close:
  both `p.innerHTML = '<div>…</div>'` and `p.insertAdjacentHTML('beforeend', …)` left the
  `<div>` nested with `nextElementSibling` null. That is spec-correct — in the fragment parsing
  algorithm the context element is not on the stack of open elements, so the `<div>` start tag
  never sees a `p` in button scope — so it holds in real browsers, not just jsdom. The rule as
  recovered named `innerHTML` and `dangerouslySetInnerHTML` as its trigger, which is the one
  path that does not produce the behaviour; it was corrected in the same change on the owner's
  call, to key on whether the `<p>` and the block are parsed together. Recovered from the
  rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather
  than enabling it”, before this pack had a references.md to hold it). Reaffirm against the
  HTML fragment parsing algorithm; retire only if the content model stops disallowing block
  content in `<p>`.
- **(RULES-2)** When both parts are ≤ 12 the day-first/month-first order is genuinely
  undecidable from the value alone — the rule is not a preference between conventions but an
  admission that the digits carry no answer, which is why it resolves once per document rather
  than per field. The month-first default is the order `Date` and most JS parsers assume, from
  the US `MM/DD/YYYY` convention. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a
  as “consequence prose arguing for a rule rather than enabling it”, before this pack had a
  references.md to hold it). Reaffirm against JS parser behaviour; retire if a positive locale
  signal becomes reliably available per field.
- **(RULES-3)** The rule is a cost argument, not a purity one: a console read costs the user
  seconds, where a deploy-and-check cycle costs a whole release. Recovered from the rule's own
  pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it). Reaffirm while releases are expensive
  relative to a console round-trip; retire if a preview environment makes the hypothesis cheap
  to test.
- **(RULES-4)** The toil being saved is the user's, not the assistant's — which is why the ask
  is the code block and the paste-back, and the prose explaining what you hope to learn is what
  gets cut. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose
  arguing for a rule rather than enabling it”, before this pack had a references.md to hold
  it). Reaffirm while a human runs the snippet; retire if the page becomes directly readable.
