# leaflet pack

Active when the repo references [Leaflet](https://leafletjs.com/): a CDN asset (`leaflet@` / `leaflet.js` / `leaflet.css`) in HTML, or an `L.map` / `L.tileLayer` / `L.markerClusterGroup` call in JS/TS source.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Feature-detect a plugin, fall back to core | high | correctness | prose: <100 words |
| An embedded map sets scrollWheelZoom false | medium | correctness | prose: <50 words |
| Keep the tile provider's attribution | critical | legal | prose: <100 words + check (`leaflet/tile-attribution`) |
| Transform a marker's inner element | medium | correctness | prose: <100 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `leaflet/asset-integrity` | high | correctness | check: blocking |
| `leaflet/tile-attribution` | critical | legal | check: blocking |
