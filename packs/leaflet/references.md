# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** The failure mode is a reader trapped mid-page: a map that is not the whole
  viewport but grabs the wheel captures a scroll that was meant for the document. Recovered
  from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule
  rather than enabling it”, before this pack had a references.md to hold it). Reaffirm while
  the map is embedded mid-page; retire for a full-viewport map, where wheel-zoom is the
  expected behaviour.
- **(RULES-2)** The ground is a licence term, not taste: OpenStreetMap's tile-usage policy
  requires visible attribution, so stripping the `attribution` string while tidying the UI
  breaks the licence. The companion `maxZoom: 19` matches the real ceiling of OSM's tiles, so
  Leaflet does not request levels the provider does not serve. Recovered from the rule's own
  pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it). Reaffirm against the current OSM
  tile-usage policy and its zoom ceiling; retire only for a provider whose terms differ.
