# Leaflet

Portable, project-agnostic gotchas for the [Leaflet](https://leafletjs.com/) web-mapping library — loading it from a CDN, embedding a map in a page, and the marker/`divIcon` and plugin behaviours that bite regardless of which app renders the map. True for any Leaflet map read cold.

- **Load Leaflet — and every Leaflet plugin — from a version-pinned CDN URL with a Subresource-Integrity hash and `crossorigin`.** Pin the exact version (`leaflet@1.9.4`, not `@latest`) and carry `integrity="sha256-…"` + `crossorigin=""` on both the CSS `<link>` and the JS `<script>`. The trap is doing this for the core bundle but forgetting a plugin — the one un-pinned `<script>` is the hole.

- **Feature-detect an optional Leaflet plugin before using it, and fall back to core when its CDN script didn't load.** A plugin's separate `<script>` (markercluster, heat, draw, …) can silently fail to load while the base Leaflet bundle succeeds, leaving `L.markerClusterGroup` (etc.) undefined. Guard the call with `typeof L.markerClusterGroup === "function"` and add markers straight to the map when it's absent — the base map must still render.

- **Default an embedded, mid-page map to `scrollWheelZoom: false` so it doesn't hijack the page scroll.** Construct it with `L.map(el, { scrollWheelZoom: false })`, or gate wheel-zoom behind a click/focus.

- **Keep the tile provider's attribution — it's a licence term, not decoration.** The `attribution: '… © OpenStreetMap contributors'` on the `L.tileLayer(...)` must stay even when tidying the UI. Set `maxZoom` to the provider's real ceiling (OSM tiles top out at 19) so Leaflet doesn't request zoom levels the provider doesn't serve.

- **When a marker needs its own CSS `transform`, put it on an inner element, not the `divIcon` root.** Leaflet positions every marker by writing an inline `transform: translate3d(...)` onto the icon's root element, clobbering any `transform` you set there on the next reposition. Make the icon root a zero-size anchor (`iconSize: [0, 0]`, `iconAnchor: [0, 0]`) and apply your rotation/centring transform to a `<span>` inside its `html`.
