# leaflet pack

Active when the repo references [Leaflet](https://leafletjs.com/) — a CDN asset (`leaflet@` / `leaflet.js` / `leaflet.css`) in HTML, or an `L.map` / `L.tileLayer` / `L.markerClusterGroup` call in JS/TS source. Mostly prose (these are runtime behaviours with no clean static signature); the CDN wiring of the assets themselves is written into the HTML, and a tile layer's attribution is written into its options object, so those are checks.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Feature-detect an optional Leaflet plugin before using it, and fall back to core when its CDN script didn't load. | high | correctness | prose: 68 words |
| Default an embedded, mid-page map to scrollWheelZoom: false so it doesn't hijack the page scroll. | medium | correctness | prose: 30 words |
| Keep the tile provider's attribution — it's a licence term, not decoration. | critical | legal | prose: 52 words + check (`leaflet/tile-attribution`) |
| When a marker needs its own CSS transform, put it on an inner element, not the divIcon root. | medium | correctness | prose: 68 words |

Provenance: distilled from `missingbulb/EdFringeNow` (the "Fringe Discover" static site — `index.html` CDN wiring and `js/app.js` map/marker/cluster code), the first fleet member seen using Leaflet.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `leaflet/asset-integrity` | high | correctness | check: blocking |
| `leaflet/tile-attribution` | critical | legal | check: blocking |
