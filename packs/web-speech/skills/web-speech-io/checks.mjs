import { patternRule } from '../../../../engine/checks/helpers/pattern-rules.mjs';
import noWindowApiInServiceWorker from './service-worker-speech.mjs';

// The checks validating this skill's action — wiring browser voice I/O.
// Discovered by engine/pack_loader/pack-registry.mjs and run at every Stop and in CI; each is
// inert until its narrow signature appears (an MV3 manifest naming a source
// service worker; a direct webkit-prefixed recognizer construction; a mic
// capture with no pagehide teardown anywhere). The first two are check-the-work
// (a file-scoped anti-pattern); the third is check-the-world (a mic that the
// whole repo releases nowhere on pagehide is a standing leak). The failure
// messages carry the rules — there is deliberately no prose copy to drift from.
// The runtime/behavioural gotchas with no static signature stay prose in the
// web-speech pack's RULES.md. The two declared checks are pattern specs, not
// code — vocabulary in the pattern-rules helper's header.
const SOURCE_FILE = /\.(mjs|cjs|jsx?|tsx?)$/;
const SKILL_OWN_DOCS = /^skills\/web-speech-io\//;

export const recognitionFeatureDetected = patternRule({
  id: 'web-speech-recognition-feature-detected',
  severity: 'advisory',
  description: 'Speech recognition is obtained through a feature-detect, not by constructing the webkit-prefixed API directly',
  doc: 'skills/web-speech-io/SKILL.md',
  why: 'Chrome exposes recognition only under the webkit prefix and headless/non-Chromium contexts expose neither, so `new webkitSpeechRecognition()` with no unprefixed fallback throws a bare ReferenceError wherever the prefixed global is absent instead of degrading to a no-op',
  scanFiles: SOURCE_FILE,
  excludeFiles: SKILL_OWN_DOCS,
  matchLines: [{
    match: /new\s+webkitSpeechRecognition\s*\(/,
    unlessFileMatches: /\bSpeechRecognition/,
    what: 'constructs the webkit-prefixed recognizer directly with no unprefixed SpeechRecognition fallback',
    fix: 'resolve the constructor once via `globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition` and gate an availability flag on it existing, so absent-API contexts degrade to a no-op',
  }],
});

export const captureReleasedOnPagehide = patternRule({
  id: 'web-speech-capture-released-on-pagehide',
  severity: 'blocking',
  description: 'A repo that opens the microphone releases it on pagehide (bfcache-safe teardown), not just on implicit page unload',
  doc: 'skills/web-speech-io/SKILL.md',
  why: 'the browser does not reliably free the mic on implicit page teardown — a page frozen into the bfcache is suspended, not destroyed, so a live recognizer or getUserMedia stream keeps the device (and the recording indicator) on until a pagehide handler stops it',
  scanFiles: SOURCE_FILE,
  excludeFiles: SKILL_OWN_DOCS,
  repoWide: [{
    unlessSomeFileMatches: /addEventListener\s*\(\s*['"`]pagehide['"`]|\bonpagehide\b/,
    flagFilesMatching: [
      [/\bgetUserMedia\s*\(/],
      [/\b(webkitSpeechRecognition|SpeechRecognition)\b/, /\.start\s*\(/],
    ],
    neverFlagFiles: /\.(test|spec)\.[cm]?jsx?$|(^|\/)(__tests__|__mocks__|fixtures?)\//,
    what: 'opens the microphone (getUserMedia / a speech recognizer) but no source file releases the capture on `pagehide`',
    fix: 'in whichever page owns the capture, add `window.addEventListener("pagehide", …)` that aborts the recognizer and stops any getUserMedia tracks (and stop a preflight capture in a `finally`) — pagehide fires on real unload AND bfcache freeze, unlike beforeunload; if the capture lives in an offscreen document torn down via closeDocument, accept this rule for that file with a reason',
  }],
});

export default [noWindowApiInServiceWorker, recognitionFeatureDetected, captureReleasedOnPagehide];
