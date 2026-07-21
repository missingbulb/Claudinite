import { finding } from '../../../../engine/checks_helpers/findings.mjs';
import { matchingLines } from '../../../../engine/checks_helpers/lines.mjs';

// Chrome ships speech recognition only under the webkit-prefixed constructor;
// other Chromium contexts (headless, non-Chromium browsers, the test binding)
// expose neither. Constructing `new webkitSpeechRecognition()` directly — with
// no feature-detect of the unprefixed `SpeechRecognition` name — throws a bare
// ReferenceError wherever the prefixed global is absent, taking down the whole
// module instead of degrading to a no-op. The portable form resolves the
// constructor once (`globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition`)
// and gates an `available` flag on it existing.
//
// RELEVANCE FIRST (see engine/README.md "Adding a rule"): a skill check runs on
// EVERY repo, so the gate is the anti-pattern itself — a source file that
// directly constructs the prefixed recognizer AND never mentions the unprefixed
// `SpeechRecognition` name (its presence anywhere, in a `??`/`||` fallback or a
// feature test, means the file is aware of both and is not scanned — a
// conservative gate that would rather miss than false-flag). Advisory: a lone
// direct construction is a smell to judge, not proof of a break. The skill's own
// directory is excluded so its fixtures never self-flag on the corpus repo.
const SELF = 'skills/web-speech-io/';
const SOURCE = /\.(mjs|cjs|jsx?|tsx?)$/;
const DIRECT_PREFIXED = /new\s+webkitSpeechRecognition\s*\(/;

// The unprefixed identifier, NOT the webkit-prefixed one — a stripped copy of
// the text (prefixed occurrences removed) makes the word-boundary test exact.
function featureDetects(text) {
  return /\bSpeechRecognition/.test(text.replace(/webkitSpeechRecognition/g, ''));
}

const rule = {
  id: 'web-speech-recognition-feature-detected',
  severity: 'advisory',
  description: 'Speech recognition is obtained through a feature-detect, not by constructing the webkit-prefixed API directly',
  doc: 'skills/web-speech-io/SKILL.md',
  why: 'Chrome exposes recognition only under the webkit prefix and headless/non-Chromium contexts expose neither, so `new webkitSpeechRecognition()` with no unprefixed fallback throws a bare ReferenceError wherever the prefixed global is absent instead of degrading to a no-op',

  run(ctx) {
    const files = ctx.files.filter((f) =>
      !f.startsWith(SELF) && SOURCE.test(f) && !featureDetects(ctx.read(f) ?? ''));
    return matchingLines(ctx, files, DIRECT_PREFIXED).map(({ file, line }) => finding(rule, {
      file, line,
      what: 'constructs the webkit-prefixed recognizer directly with no unprefixed SpeechRecognition fallback',
      fix: 'resolve the constructor once via `globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition` and gate an availability flag on it existing, so absent-API contexts degrade to a no-op',
    }));
  },
};

export default rule;
