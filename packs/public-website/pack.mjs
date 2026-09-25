import { isPage, STAMP } from './public/version.mjs';

// Being a public website, whatever serves it: the version the site carries and the
// stamp its pages show, and the ways a page that fetches its own data goes quietly
// stale. A hosting pack's release reaches `public/version.mjs` to advance the version
// as part of cutting a release, and goes out without a bump when the file is absent.
const carriesAStamp = (ctx) => ctx.tracked.some((f) => isPage(f) && new RegExp(STAMP.source).test(ctx.read(f) ?? ''));

export default {
  version: '60925.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'being a public website whatever serves it: the version scheme and page stamp, client-side caching and data freshness',
    excludes: 'how the site is built, served or released — the hosting pack declared beside this one; markup — html',
  },
  marker: 'a tracked page carrying a `title="version …"` stamp',
  detect: carriesAStamp,
  requires: ['html'],
};
