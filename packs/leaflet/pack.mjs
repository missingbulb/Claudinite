
// Leaflet pack: portable runtime gotchas for the Leaflet web-mapping library
// (map init, tile layers, markers/divIcons, and CDN-loaded plugins like
// Leaflet.markercluster).

const LEAFLET_ASSET = /\bleaflet(\.js|\.css|@[\d.]|[-/]dist)/i;
const LEAFLET_API = /\bL\.(map|tileLayer|markerClusterGroup)\s*\(/;
const SOURCE = /\.(html?|mjs|cjs|jsx?|tsx?)$/;

export default {
  version: '60927.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'map rendering with the Leaflet library — map init options, tile layers, markers and divIcons, CDN plugin pinning',
    excludes: 'generic HTML markup rules — that is html; non-map dependency policy belongs to node',
  },
  pitch: 'Maps built with Leaflet fail in small, visible ways: a plugin missing from the CDN takes the whole map down, an embedded map hijacks page scrolling, or the tile provider\'s required attribution disappears. This pack gives Claude Code sessions a few rules for feature-detecting plugins with a fallback to core, disabling scroll-wheel zoom on embedded maps, keeping attribution, and transforming markers correctly. A couple of checks block CDN assets without integrity hashes and tile layers without attribution.',
  marker: 'a Leaflet reference (CDN asset, or an L.map/L.tileLayer/L.markerClusterGroup call) in HTML/JS source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && (LEAFLET_ASSET.test(text) || LEAFLET_API.test(text));
    }),
};
