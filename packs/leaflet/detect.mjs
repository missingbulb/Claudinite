// One of the four fingerprints that stays code: this one reads file CONTENT, which
// the declarative `trackedPath` vocabulary deliberately cannot ask about
// (engine/pack_loader/detect-spec.mjs). No filename announces Leaflet — the
// library arrives as a CDN asset or an API call site inside ordinary source — so
// the only honest fingerprint is an actual reference: a Leaflet asset (leaflet@ /
// leaflet.js / leaflet.css / a leaflet dist path) or a Leaflet API call
// (L.map( / L.tileLayer( / L.markerClusterGroup( ).
//
// Asset names are matched case-insensitively (CDN paths and vendored copies vary);
// the API surface is not, because `L.` is capitalized by the library's own
// contract and a case-blind match would hit unrelated identifiers. The two flags
// differing is itself a reason this is a function.
//
// The marker only *suspects* the pack; declaring it is the project's call, like
// every pack.
const LEAFLET_ASSET = /\bleaflet(\.js|\.css|@[\d.]|[-/]dist)/i;
const LEAFLET_API = /\bL\.(map|tileLayer|markerClusterGroup)\s*\(/;
const SOURCE = /\.(html?|mjs|cjs|jsx?|tsx?)$/;

export default (ctx) =>
  ctx.tracked.some((f) => {
    if (!SOURCE.test(f)) return false;
    const text = ctx.read(f);
    return text !== null && (LEAFLET_ASSET.test(text) || LEAFLET_API.test(text));
  });
