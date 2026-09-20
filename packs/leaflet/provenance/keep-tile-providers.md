## 2026-09-01 · born · converted from references.md (RULES-2)
- **Reason:** The ground is a licence term, not taste: OpenStreetMap's tile-usage policy requires
  visible attribution, so stripping the `attribution` string while tidying the UI breaks the
  licence. The companion `maxZoom: 19` matches the real ceiling of OSM's tiles, so Leaflet does not
  request levels the provider does not serve. Recovered from the rule's own pre-#467 text (cut by
  2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this pack
  had a references.md to hold it).
- **Mechanism:** prose
- **Retire when:** Reaffirm against the current OSM tile-usage policy and its zoom ceiling; retire
  only for a provider whose terms differ.
