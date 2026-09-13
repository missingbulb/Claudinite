# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(writing-wiki-pages-1)** The pack claims user research as its territory but carries no rule
  on reading a quote, so nothing distinguished what a respondent said from the frame the asker
  or the publishing vendor put around it. Retire if the pack stops covering user research, or if
  a check can establish a quote's speaker.
- **(writing-wiki-pages-2)** The pack's neighbouring rule covers who *published* a figure;
  nothing covered how many people back a qualitative finding, leaving one thread's replies to
  read as that many data points. Retire if the pack stops covering user research.
- **(writing-wiki-pages-3)** A user-research page sourced entirely from review sites, forum
  threads and competitors' testimonials passes `product-wiki-sources`,
  `product-wiki-page-sections` and `product-wiki-key-insights` while describing other people's
  customers — the pack's only failure mode that looks healthy to every check it has. The owner
  declined the raw-evidence layer that would supply first-party evidence instead (no first
  caller; PII would enter git history permanently; an append-only guarantee is unenforceable by
  a tracked-tree check), so honest labelling is the whole remedy. Retire when the pack gains a
  first-party evidence channel.
