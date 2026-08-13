import { patternRule } from '../../../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'web-speech-recognition-feature-detected',
  severity: 'advisory',
  description: 'Speech recognition is obtained through a feature-detect, not by constructing the webkit-prefixed API directly',
  doc: 'skills/web-speech-io/SKILL.md',
  why: 'Chrome exposes recognition only under the webkit prefix and headless/non-Chromium contexts expose neither, so `new webkitSpeechRecognition()` with no unprefixed fallback throws a bare ReferenceError wherever the prefixed global is absent instead of degrading to a no-op',
  files: /\.(mjs|cjs|jsx?|tsx?)$/,
  exclude: /^skills\/web-speech-io\//,
  line: [{
    match: /new\s+webkitSpeechRecognition\s*\(/,
    unlessFile: /\bSpeechRecognition/,
    what: 'constructs the webkit-prefixed recognizer directly with no unprefixed SpeechRecognition fallback',
    fix: 'resolve the constructor once via `globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition` and gate an availability flag on it existing, so absent-API contexts degrade to a no-op',
  }],
});
