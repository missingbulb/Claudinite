// web-scraping pack: taking data from a website you don't own and have no
// contract with — locating the real data surface, fetching defensively, keeping
// a committed raw record so the parse re-runs offline, and refreshing each field
// on the clock it actually moves on.
//
// No fingerprint. A scraper is ordinary HTTP client code in whatever language the
// project already uses (an `http` call, a `requests` session, a `fetch`), and the
// same call sites appear in any project that talks to any API it *does* own — so
// every candidate signature suspects the pack in repos that want nothing to do
// with it. Declaration is authoritative instead.
//
// Prose and one skill, no checks. Every rule here is about a REMOTE service's
// behaviour — which field is authoritative, whether an instant is UTC, when a 200
// is actually a bot wall — and none of it is written into repo state in a shape a
// deterministic check could read without false-positiving on ordinary HTTP code.
// The one-off reconnaissance procedure has a nameable trigger, so it descends to a
// skill rather than sitting in always-loaded prose.

export default {
  version: '60822.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs:
      'acquiring data from a site you do not own: finding its data surface, fetching defensively, caching raw payloads',
    excludes:
      'Actions triggers and secrets wiring — that is git-github; publishing a site you own — that is static-website',
  },
};
