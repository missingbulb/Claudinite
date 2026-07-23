// Leaflet pack: portable runtime gotchas for the Leaflet web-mapping library
// (map init, tile layers, markers/divIcons, and CDN-loaded plugins like
// Leaflet.markercluster). Prose-only — these are runtime/asset-wiring behaviours,
// not repo-state signatures a static check could test. Fingerprinted by an actual
// Leaflet reference: a CDN asset (leaflet@ / leaflet.js / leaflet.css) in HTML, or
// a Leaflet API call site (L.map( / L.tileLayer( / L.markerClusterGroup() ) in
// source. The marker only *suspects* the pack; declaring it is the project's call,
// like every pack.
const LEAFLET_ASSET = /\bleaflet(\.js|\.css|@[\d.]|[-/]dist)/i;
const LEAFLET_API = /\bL\.(map|tileLayer|markerClusterGroup)\s*\(/;
const SOURCE = /\.(html?|mjs|cjs|jsx?|tsx?)$/;

export default {
  id: 'leaflet',
  marker: 'a Leaflet reference (CDN asset, or an L.map/L.tileLayer/L.markerClusterGroup call) in HTML/JS source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && (LEAFLET_ASSET.test(text) || LEAFLET_API.test(text));
    }),
  prose: 'RULES.md',
  rules: [],
};
