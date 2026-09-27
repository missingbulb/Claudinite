// Leaflet pack: portable runtime gotchas for the Leaflet web-mapping library
// (map init, tile layers, markers/divIcons, and CDN-loaded plugins like
// Leaflet.markercluster).

export default {
  version: '60925.1',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'map rendering with the Leaflet library — map init options, tile layers, markers and divIcons, CDN plugin pinning',
    excludes: 'generic HTML markup rules — that is html; non-map dependency policy belongs to node',
  },
  pitch: 'Maps built with Leaflet fail in small, visible ways: a plugin missing from the CDN takes the whole map down, an embedded map hijacks page scrolling, or the tile provider\'s required attribution disappears. This pack gives Claude Code sessions a few rules for feature-detecting plugins with a fallback to core, disabling scroll-wheel zoom on embedded maps, keeping attribution, and transforming markers correctly. A couple of checks block CDN assets without integrity hashes and tile layers without attribution.',
  // A page calling only L.map( loads Leaflet from a file that names it, so the search
  // terms still reach the repo.
  locate: {
    about: 'a Leaflet reference (CDN asset, or an L.map/L.tileLayer/L.markerClusterGroup call) in HTML/JS source',
    paths: /\.(html?|mjs|cjs|jsx?|tsx?)$/,
    // `leaflet` in any case, spelled out: the `L.map(` half must not ignore case.
    text: /\b[lL][eE][aA][fF][lL][eE][tT](\.[jJ][sS]|\.[cC][sS][sS]|@[\d.]|[-/][dD][iI][sS][tT])|\bL\.(map|tileLayer|markerClusterGroup)\s*\(/,
    search: ['leaflet', 'tileLayer', 'markerClusterGroup'],
  },
};
