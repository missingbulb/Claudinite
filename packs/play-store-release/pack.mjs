// Opt-in release stub pack: releasing to the Google Play Store (Play Console, signing, integrity, staged rollout).
// No rules captured yet, so no RULES.md; no fingerprint, so a project declares it by hand.
export default {
  version: '60927.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'shipping an Android app to Google Play — Play Console, signing, integrity, staged rollout',
    excludes: 'day-to-day Android or iOS coding rules — those are android and ios; Apple shipping is app-store-release',
  },
  pitch: 'Releasing an Android app on Google Play means Play Console, app signing keys, integrity checks and staged rollouts, and the details are easy to forget between releases. This pack starts empty: it holds no rules, checks or skills yet. It is the place where the repo\'s own lessons about Play Store releases accumulate, written as rules that every later Claude Code session reads before touching signing or a rollout, so a mistake made once becomes a rule instead of a repeat.',
};
