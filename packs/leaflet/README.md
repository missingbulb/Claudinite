# leaflet pack

Active when the repo references [Leaflet](https://leafletjs.com/) — a CDN asset (`leaflet@` / `leaflet.js` / `leaflet.css`) in HTML, or an `L.map` / `L.tileLayer` / `L.markerClusterGroup` call in JS/TS source. Mostly prose (these are runtime behaviours with no clean static signature); the CDN wiring of the assets themselves is written into the HTML, and a tile layer's attribution is written into its options object, so those are checks.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Feature-detect plugin, fall back to core | prose |
| Embedded map: scrollWheelZoom false | prose |
| Keep tile attribution + maxZoom | check (`leaflet/tile-attribution`) for the attribution; prose for the provider's real `maxZoom` ceiling |
| divIcon transform on inner span | prose |

Provenance: distilled from `missingbulb/EdFringeNow` (the "Fringe Discover" static site — `index.html` CDN wiring and `js/app.js` map/marker/cluster code), the first fleet member seen using Leaflet.
