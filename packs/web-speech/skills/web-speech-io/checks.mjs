import noWindowApiInServiceWorker from './service-worker-speech.mjs';
import recognitionFeatureDetected from './recognition-feature-detect.mjs';
import captureReleasedOnPagehide from './capture-pagehide-teardown.mjs';

// The checks validating this skill's action — wiring browser voice I/O.
// Discovered by skills/registry.mjs and run at every Stop and in CI; each is
// inert until its narrow signature appears (an MV3 manifest naming a source
// service worker; a direct webkit-prefixed recognizer construction; a mic
// capture with no pagehide teardown anywhere). The first two are check-the-work
// (a file-scoped anti-pattern); the third is check-the-world (a mic that the
// whole repo releases nowhere on pagehide is a standing leak). The failure
// messages carry the rules — there is deliberately no prose copy to drift from.
// The runtime/behavioural gotchas with no static signature stay prose in the
// web-speech pack's RULES.md.
export default [noWindowApiInServiceWorker, recognitionFeatureDetected, captureReleasedOnPagehide];
