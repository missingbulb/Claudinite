
// Leaflet pack: portable runtime gotchas for the Leaflet web-mapping library
// (map init, tile layers, markers/divIcons, and CDN-loaded plugins like
// Leaflet.markercluster). Most are runtime behaviours with no repo-state
// signature and stay prose; the CDN wiring of the assets themselves is written
// into the HTML, and a tile layer's attribution is written into its own options
// object, so those convert. Fingerprinted by an actual Leaflet reference: a
// CDN asset (leaflet@ / leaflet.js / leaflet.css) in HTML, or a Leaflet API call
// site (L.map( / L.tileLayer( / L.markerClusterGroup() ) in source. The marker
// only *suspects* the pack; declaring it is the project's call, like every pack.

const LEAFLET_ASSET = /\bleaflet(\.js|\.css|@[\d.]|[-/]dist)/i;
const LEAFLET_API = /\bL\.(map|tileLayer|markerClusterGroup)\s*\(/;
const SOURCE = /\.(html?|mjs|cjs|jsx?|tsx?)$/;

export default {
  version: '60902.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'map rendering with the Leaflet library — map init options, tile layers, markers and divIcons, CDN plugin pinning',
    excludes: 'generic HTML markup rules — that is html; non-map dependency policy belongs to node',
  },
  marker: 'a Leaflet reference (CDN asset, or an L.map/L.tileLayer/L.markerClusterGroup call) in HTML/JS source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && (LEAFLET_ASSET.test(text) || LEAFLET_API.test(text));
    }),
};
