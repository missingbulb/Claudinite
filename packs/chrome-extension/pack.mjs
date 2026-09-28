export default {
  version: '60927.2',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'writing and shipping a Chrome extension: MV3 service-worker, permission, content-script and auth gotchas, plus Web Store release, versioning and privacy',
    excludes: 'generic workflow lint rules — git-github; shipping to a different store — the app-store-release and play-store-release packs',
  },
  pitch: 'For a repo that builds a Manifest V3 extension, this carries the gotchas that otherwise surface as silent failures: service worker paths, re-injected content scripts, host permissions, sign-in tokens and extension UI surfaces. About twenty rules and some twenty checks catch them while code is being written. Two skills cover host permissions and the Chrome Web Store release standard, and once the repo ships the release pipeline, a daily task builds and publishes the store release by itself, with conformance checks keeping the pipeline intact.',
  relevanceDetector: { about: 'a manifest.json declaring manifest_version', paths: "manifest\\.json$", text: "\"manifest_version\"", search: ['manifest_version'] },
};
