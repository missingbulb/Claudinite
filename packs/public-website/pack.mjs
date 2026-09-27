import { STAMP } from './public/version.mjs';

// Being a public website, whatever serves it: the version the site carries and the
// stamp its pages show, and the ways a page that fetches its own data goes quietly
// stale. A hosting pack's release reaches `public/version.mjs` to advance the version
// as part of cutting a release, and goes out without a bump when the file is absent.
export default {
  version: '60927.2',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'being a public website whatever serves it: the version scheme and page stamp, client-side caching and data freshness',
    excludes: 'how the site is built, served or released — the hosting pack declared beside this one; markup — html',
  },
  pitch: 'For a repo that publishes a public site, this pack keeps the version shown on the pages honest and stops pages that fetch their own data from going quietly stale. The version is generated from one source and stamped into every page, and a blocking check fails any page naming a build that was never served. A handful of rules steer Claude Code sessions toward hash-based cache manifests, halves of a split payload that stay in sync, and missing data traced through to what the page actually renders.',
  relevanceDetector: { about: 'a tracked page carrying a `title="version …"` stamp', paths: /\.html$/, text: new RegExp(STAMP.source), search: ['version'] },
  requires: ['html'],
};
