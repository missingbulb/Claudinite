# leaflet pack

Active when the repo references [Leaflet](https://leafletjs.com/) — a CDN asset (`leaflet@` / `leaflet.js` / `leaflet.css`) in HTML, or an `L.map` / `L.tileLayer` / `L.markerClusterGroup` call in JS/TS source. Mostly prose (these are runtime behaviours with no clean static signature); the CDN wiring of the assets themselves is written into the HTML, so it is a check.

## Checks

Relevance-first: only a `<script>`/`<link>` whose *own* remote URL names a Leaflet asset is judged, so a locally vendored copy, a preconnect to the CDN host, and a Leaflet URL sitting in page text or an HTML comment are all untouched.

| Rule (≤5 words) | Severity | What |
|---|---|---|
| Pin + SRI every Leaflet asset | blocking | a CDN `<script>`/`<link>` for Leaflet or a Leaflet plugin carries an exact version, `integrity="sha…"`, and `crossorigin` |

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Feature-detect plugin, fall back to core | prose |
| Embedded map: scrollWheelZoom false | prose |
| Keep tile attribution + maxZoom | prose |
| divIcon transform on inner span | prose |

Provenance: distilled from `missingbulb/EdFringeNow` (the "Fringe Discover" static site — `index.html` CDN wiring and `js/app.js` map/marker/cluster code), the first fleet member seen using Leaflet.
