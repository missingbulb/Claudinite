import { patternRule } from '../../../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'web-speech-capture-released-on-pagehide',
  severity: 'blocking',
  description: 'A repo that opens the microphone releases it on pagehide (bfcache-safe teardown), not just on implicit page unload',
  doc: 'skills/web-speech-io/SKILL.md',
  why: 'the browser does not reliably free the mic on implicit page teardown — a page frozen into the bfcache is suspended, not destroyed, so a live recognizer or getUserMedia stream keeps the device (and the recording indicator) on until a pagehide handler stops it',
  scanFiles: /\.(mjs|cjs|jsx?|tsx?)$/,
  excludeFiles: /^skills\/web-speech-io\//,
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
