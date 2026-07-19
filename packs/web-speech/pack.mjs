// The browser voice-I/O pack: speech-to-text (webkitSpeechRecognition / the Web
// Speech SpeechRecognition API) and text-to-speech (chrome.tts / speechSynthesis)
// runtime gotchas that apply whenever an app reads or listens through the browser.
// Mostly prose — these are runtime browser behaviours, not repo-state signatures a
// static check could test — plus the web-speech-io skill, whose three rules own the
// gotchas that DO have a static signature: a Window-scoped speech API in the MV3
// service worker, and a bare webkit-prefixed recognizer construction (both
// check-the-work), plus a mic capture the whole repo releases nowhere on pagehide
// (check-the-world). Fingerprinted by an actual speech-API reference in JS/TS source
// (the marker only *suspects* the pack; declaring it is the project's call, like
// every pack).
const SPEECH_API =
  /\b(webkitSpeechRecognition|SpeechRecognition|SpeechRecognitionPhrase|speechSynthesis|SpeechSynthesisUtterance|chrome\.tts)\b/;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;

export default {
  id: 'web-speech',
  marker: 'a browser speech API (SpeechRecognition / speechSynthesis / chrome.tts) referenced in JS/TS source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && SPEECH_API.test(text);
    }),
  prose: 'RULES.md',
  skills: ['web-speech-io'],
  rules: [],
};
