# leaflet pack

Active when the repo references [Leaflet](https://leafletjs.com/) — a CDN asset (`leaflet@` / `leaflet.js` / `leaflet.css`) in HTML, or an `L.map` / `L.tileLayer` / `L.markerClusterGroup` call in JS/TS source. Mostly prose (these are runtime behaviours with no clean static signature); the CDN wiring of the assets themselves is written into the HTML, and a tile layer's attribution is written into its options object, so those are checks.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Feature-detect a plugin, fall back to core | high | correctness | prose: 68 words |
| An embedded map sets scrollWheelZoom false | medium | correctness | prose: 31 words |
| Keep the tile provider's attribution | critical | legal | prose: 53 words + check (`leaflet/tile-attribution`) |
| Transform a marker's inner element | medium | correctness | prose: 68 words |

Provenance: distilled from `missingbulb/EdFringeNow` (the "Fringe Discover" static site — `index.html` CDN wiring and `js/app.js` map/marker/cluster code), the first fleet member seen using Leaflet.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `leaflet/asset-integrity` | high | correctness | check: blocking |
| `leaflet/tile-attribution` | critical | legal | check: blocking |
