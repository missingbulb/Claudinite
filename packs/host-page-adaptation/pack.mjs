// host-page-adaptation — being a guest in a web app you do not own: reading its
// DOM, driving it with synthetic input, watching it change, and injecting your
// own UI into it, all against markup that can be redesigned without notice.
//
// Every rule here judges a DOM/API contract that holds for any code driving a
// third-party page — a userscript, a browser automation layer, an extension's
// content script — and its scan is repo-shape agnostic (see lib.mjs `isSource`)
// so it cannot pass vacuously green somewhere laid out differently.
export default {
  version: '60823.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'driving a host web app you don\'t own — its DOM, synthetic input, change watching, injected UI',
    excludes: 'how extension code reaches the page (manifest, permissions, registration) — chrome-extension; speech APIs — web-speech',
  },
};
