// A practice pack (prose-only, no fingerprint): the discipline for driving a web
// page you don't own — reading its DOM, driving it with synthetic input,
// watching it change, putting your own UI into its chrome. Applies to a
// browser extension's content script, a userscript, a browser-automation tool,
// or a scraper that also has to click and type — no single technology owns it,
// so it carries no marker; declaration is authoritative like every
// class/practice pack (research-project, spec-driven-product).
export default {
  version: '60831.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'driving a web page you do not control — DOM quarantine, selector resilience, synthetic input fidelity, verified writes, host lifecycle',
    excludes: 'extension packaging — chrome-extension; driving a browser you launched — headless-browser; markup gotchas — html',
  },
};
