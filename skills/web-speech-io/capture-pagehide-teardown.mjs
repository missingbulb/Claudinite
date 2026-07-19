import { finding } from '../../checks/lib/findings.mjs';

// A live microphone capture — a speech recognizer, or a `getUserMedia` stream —
// is NOT freed by the browser's implicit page teardown. A page frozen into the
// back/forward cache (bfcache) is *suspended, not destroyed*, so the recognizer
// (or the getUserMedia tracks) keep the device — and the recording indicator —
// held with no code of yours running. The deterministic release is a `pagehide`
// handler (it fires on real unload AND on bfcache freeze, unlike `beforeunload`)
// that aborts the recognizer / stops the tracks, in whichever page owns the
// capture. This is check-the-world on purpose: a repo that opens the mic but
// releases it nowhere on `pagehide` is a standing leak however long ago it
// merged, so the whole tracked source is the scope — not just the diff.
//
// RELEVANCE FIRST (see checks/README.md "Adding a rule"): the check runs on
// EVERY repo, so the gate is narrow and conservative — it fires only when the
// repo actually opens the mic (a `getUserMedia` call, or a file that both
// references the recognizer API and `.start()`s it) AND no source file anywhere
// registers a `pagehide` handler. The release may live in whichever context owns
// the stream (content script, popup, side panel, offscreen document), so a
// pagehide handler ANYWHERE in the repo's source satisfies the rule — a
// repo-wide presence test that would rather miss a split-context case than
// false-flag a repo that already tears down. Blocking: a mic left held after
// teardown is a real device leak (the recording indicator stays lit, the
// device is pinned); the one legitimate exception — a capture in an offscreen
// document torn down via closeDocument — takes an accept-with-reason, the
// check-the-world exemption path. The skill's own directory is excluded so its
// fixtures never self-flag on the corpus repo; test/fixture files are excluded
// from the acquisition scan, where a mocked `getUserMedia` opens no real device.
const SELF = 'skills/web-speech-io/';
const SOURCE = /\.(mjs|cjs|jsx?|tsx?)$/;
const TEST = /\.(test|spec)\.[cm]?jsx?$|(^|\/)(__tests__|__mocks__|fixtures?)\//;

const GET_USER_MEDIA = /\bgetUserMedia\s*\(/;
const RECOGNIZER = /\b(webkitSpeechRecognition|SpeechRecognition)\b/;
const START = /\.start\s*\(/;
// A pagehide teardown, however it is registered.
const PAGEHIDE = /addEventListener\s*\(\s*['"`]pagehide['"`]|\bonpagehide\b/;

// The 1-indexed line where a file opens the microphone, or null. A `getUserMedia`
// call is the unambiguous anchor; failing that, a file that both names the
// recognizer API and `.start()`s something is driving a live recognizer — anchor
// on the recognizer reference.
function acquisitionLine(text) {
  const lines = text.split('\n');
  const gum = lines.findIndex((l) => GET_USER_MEDIA.test(l));
  if (gum !== -1) return gum + 1;
  if (RECOGNIZER.test(text) && START.test(text)) {
    const ref = lines.findIndex((l) => RECOGNIZER.test(l));
    if (ref !== -1) return ref + 1;
  }
  return null;
}

const rule = {
  id: 'web-speech-capture-released-on-pagehide',
  severity: 'blocking',
  description: 'A repo that opens the microphone releases it on pagehide (bfcache-safe teardown), not just on implicit page unload',
  doc: 'skills/web-speech-io/SKILL.md',
  why: 'the browser does not reliably free the mic on implicit page teardown — a page frozen into the bfcache is suspended, not destroyed, so a live recognizer or getUserMedia stream keeps the device (and the recording indicator) on until a pagehide handler stops it',

  run(ctx) {
    const source = ctx.files.filter((f) => !f.startsWith(SELF) && SOURCE.test(f));
    // Conformance is repo-wide: a pagehide teardown in ANY owning context clears it.
    if (source.some((f) => PAGEHIDE.test(ctx.read(f) ?? ''))) return [];
    const out = [];
    for (const f of source) {
      if (TEST.test(f)) continue; // a mocked getUserMedia in a test opens no device
      const text = ctx.read(f);
      if (text === null) continue;
      const line = acquisitionLine(text);
      if (line === null) continue;
      out.push(finding(rule, {
        file: f, line,
        what: 'opens the microphone (getUserMedia / a speech recognizer) but no source file releases the capture on `pagehide`',
        fix: 'in whichever page owns the capture, add `window.addEventListener("pagehide", …)` that aborts the recognizer and stops any getUserMedia tracks (and stop a preflight capture in a `finally`) — pagehide fires on real unload AND bfcache freeze, unlike beforeunload; if the capture lives in an offscreen document torn down via closeDocument, accept this rule for that file with a reason',
      }));
    }
    return out;
  },
};

export default rule;
