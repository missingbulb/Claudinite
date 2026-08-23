import { finding } from '../../../engine/checks/helpers/findings.mjs';

// Converted from the leaflet prose: every Leaflet asset loaded from a CDN — the
// core bundle AND every plugin — must be version-pinned and carry an SRI hash
// with `crossorigin`. The trap the prose names is a partial job: the core
// `leaflet@1.9.4` script gets the full treatment and a plugin's `<script>` is
// left bare, so one un-hashed third-party URL still executes with the page's
// full authority. That is a static signature in the HTML, so it converts.
//
// PARSED, NOT GREPPED (the skill's rule): grep for `unpkg.com` or `integrity`
// answers the wrong question. The rule is about one *tag* — a `<script>`/`<link>`
// whose own URL is a remote Leaflet asset — so the scan reads each tag's own
// attributes and judges only those. A locally vendored `js/leaflet.js`, a
// preconnect to the CDN host, and a Leaflet URL sitting in ordinary page text are
// all none of this rule's business. HTML comments are stripped first, so an
// example of the bad wiring written in a comment never fires it.

const HTML = /\.html?$/i;
const TAG = /<(script|link)\b([^>]*)>/gi;
const REMOTE = /^(?:https?:)?\/\//i;
const LEAFLET = /leaflet/i;
// An exact pin is a `major.minor…` version reached by the URL's own delimiters —
// `leaflet@1.9.4/…` (unpkg/jsdelivr), `/leaflet/1.9.4/…` (cdnjs), `leaflet-1.9.4.js`
// (a self-hosted mirror). A bare `@latest`, a major-only `@1`, or a version-less
// path matches none of them.
const PINNED = /[@/-]\d+\.\d+[\w.+-]*(?:$|[/?#])/;
const SRI = /^sha(?:256|384|512)-\S+/;

// `source` with its HTML comments blanked out, newlines kept so line numbers
// don't shift.
function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

// The tag's own attributes as a lowercased-name map. A valueless attribute
// (`crossorigin`) maps to '' — present, which is what the rule asks.
function attributes(text) {
  const attrs = {};
  const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = m[2] ?? '';
    attrs[m[1].toLowerCase()] =
      raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
  }
  return attrs;
}

const rule = {
  id: 'leaflet/asset-integrity',
  severity: 'blocking',
  description:
    'Every CDN-loaded Leaflet asset — core bundle and plugins alike — is version-pinned and carries an SRI hash with crossorigin',
  doc: 'packs/leaflet/RULES.md',
  why: 'an un-pinned or un-hashed third-party script runs with the page\'s full authority, so whatever the CDN serves tomorrow is what your users execute — and the hole is usually a plugin tag left bare beside a correctly wired core bundle',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!HTML.test(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !LEAFLET.test(raw)) continue;
      const src = stripHtmlComments(raw);
      TAG.lastIndex = 0;
      for (let m = TAG.exec(src); m; m = TAG.exec(src)) {
        const attrs = attributes(m[2]);
        const url = m[1].toLowerCase() === 'script' ? attrs.src : attrs.href;
        if (!url || !REMOTE.test(url) || !LEAFLET.test(url)) continue;

        const missing = [];
        if (!PINNED.test(url)) missing.push('an exact version pin (leaflet@1.9.4, never @latest)');
        if (!SRI.test(attrs.integrity ?? '')) missing.push('integrity="sha256-…"');
        if (attrs.crossorigin === undefined) missing.push('crossorigin');
        if (missing.length === 0) continue;

        out.push(finding(rule, {
          file,
          line: src.slice(0, m.index).split('\n').length,
          what: `loads the Leaflet asset ${url} without ${missing.join(' / ')}`,
          fix: `pin the exact version in the URL and carry integrity="sha256-…" + crossorigin="" on this <${m[1].toLowerCase()}> — the plugin tags too, not just the core bundle`,
        }));
      }
    }
    return out;
  },
};

export default rule;
