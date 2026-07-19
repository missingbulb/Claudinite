import noWindowApiInServiceWorker from './service-worker-speech.mjs';
import recognitionFeatureDetected from './recognition-feature-detect.mjs';

// The check-the-work rules validating this skill's action — wiring browser voice
// I/O. Discovered by skills/registry.mjs and run at every Stop and in CI; each is
// inert until its narrow signature appears (an MV3 manifest naming a source
// service worker; a direct webkit-prefixed recognizer construction). The failure
// messages carry the rules — there is deliberately no prose copy to drift from.
// The runtime/behavioural gotchas with no static signature stay prose in the
// web-speech pack's RULES.md.
export default [noWindowApiInServiceWorker, recognitionFeatureDetected];
