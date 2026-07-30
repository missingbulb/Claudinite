// One of the four fingerprints that stays code: it reads file CONTENT, which the
// declarative `trackedPath` vocabulary deliberately cannot ask about
// (engine/pack_loader/detect-spec.mjs). Browser voice I/O leaves no file or
// directory behind — it is a handful of global APIs referenced from ordinary
// source — so an actual reference in JS/TS is the only honest fingerprint.
//
// The marker only *suspects* the pack; declaring it is the project's call, like
// every pack.
const SPEECH_API =
  /\b(webkitSpeechRecognition|SpeechRecognition|SpeechRecognitionPhrase|speechSynthesis|SpeechSynthesisUtterance|chrome\.tts)\b/;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;

export default (ctx) =>
  ctx.tracked.some((f) => {
    if (!SOURCE.test(f)) return false;
    const text = ctx.read(f);
    return text !== null && SPEECH_API.test(text);
  });
