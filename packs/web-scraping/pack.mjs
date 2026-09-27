// web-scraping pack: taking data from a website you don't own and have no
// contract with — locating the real data surface, fetching defensively, keeping
// a committed raw record so the parse re-runs offline, and refreshing each field
// on the clock it actually moves on. No fingerprint, no checks: prose and one
// skill, activated by declaration.

export default {
  version: '60925.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs:
      'acquiring data from a site you do not own: finding its data surface, fetching defensively, caching raw payloads',
    excludes:
      'Actions triggers and secrets wiring — that is git-github; publishing a site you own — that is public-website',
  },
  pitch: 'For a repo whose input is someone else\'s website, reached with no contract, changelog or support channel. A couple of dozen rules steer Claude Code sessions through the ways scrapers fail quietly: an empty or blocked response counted as success, one bad item sinking a whole batch, retries that hammer a host, ambiguous dates and time zones parsed wrong, and refreshes that rewrite unchanged data. The map-a-data-source skill makes each new source start with reconnaissance, finding the site\'s real data surface before any parser is written.',
};
