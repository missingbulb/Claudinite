// Red-first coverage for the six speech-contract checks. Each is exercised both
// ways — it must FIRE on a source that breaks the contract and stay QUIET on one
// that keeps it — because a check nobody has watched fail is a check nobody has
// confronted with the shape it is supposed to catch.
//
// The quiet cases matter as much as the firing ones here: every one of these
// rules parses a call site rather than grepping for a name, and the legitimate
// spellings they must not flag (a wrapper that delegates terminal handling, a
// hoisted constraints constant, a switch that dispatches rather than maps) are
// exactly where a text scan would false-alarm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';

import micCaptureReleased from '../worldRules/mic-capture-released.mjs';
import micConstraints from '../worldRules/mic-constraints-not-screen-capture.mjs';
import errorMapHasDefault from '../worldRules/stt-error-map-has-default.mjs';
import interimGated from '../worldRules/stt-interim-results-gated.mjs';
import terminalHandlers from '../worldRules/stt-terminal-handlers.mjs';
import speakSettles from '../worldRules/tts-speak-settles.mjs';

const runOn = (rule, files) => {
  const root = makeRepo({ changed: files });
  try {
    return rule.run(buildContext({ root, mode: 'all' }));
  } finally { cleanup(root); }
};

const fires = (rule, files, match) => {
  const findings = runOn(rule, files);
  assert.equal(findings.length, 1, `expected exactly one finding, got ${JSON.stringify(findings, null, 2)}`);
  assert.equal(findings[0].rule, rule.id);
  assert.equal(findings[0].severity, 'blocking');
  if (match) assert.match(findings[0].what, match);
};

const quiet = (rule, files) => {
  const findings = runOn(rule, files);
  assert.deepEqual(findings, [], `expected silence, got ${JSON.stringify(findings, null, 2)}`);
};

test('mic-capture-released: flags a capture whose tracks are never stopped', () => {
  fires(micCaptureReleased, {
    'src/preflight.js': `export async function warm() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return stream.getAudioTracks()[0].getSettings();
}
`,
  }, /never stop|releases/i);
});

test('mic-capture-released: quiet when the file stops the tracks', () => {
  quiet(micCaptureReleased, {
    'src/preflight.js': `export async function warm() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    return stream.getAudioTracks()[0].getSettings();
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
`,
  });
});

test('mic-constraints-not-screen-capture: flags a screen-capture constraint on a mic', () => {
  fires(micConstraints, {
    'src/mic.js': `export const open = () => navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, suppressLocalAudioPlayback: true },
});
`,
  }, /suppressLocalAudioPlayback/);
});

test('mic-constraints-not-screen-capture: quiet on the same name in a getDisplayMedia call', () => {
  quiet(micConstraints, {
    'src/tab.js': `export const capture = () => navigator.mediaDevices.getDisplayMedia({
  audio: { suppressLocalAudioPlayback: true },
});
`,
  });
});

test('stt-error-map-has-default: flags a mapping switch with no default arm', () => {
  fires(errorMapHasDefault, {
    'src/errors.js': `export function kindOf(name) {
  switch (name) {
    case 'not-allowed': return 'permission-denied';
    case 'no-speech': return 'nothing-heard';
    case 'network': return 'offline';
  }
}
`,
  }, /default/);
});

test('stt-error-map-has-default: quiet once the mapping is total', () => {
  quiet(errorMapHasDefault, {
    'src/errors.js': `export function kindOf(name) {
  switch (name) {
    case 'not-allowed': return 'permission-denied';
    case 'no-speech': return 'nothing-heard';
    case 'network': return 'offline';
    default: return 'other';
  }
}
`,
  });
});

test('stt-interim-results-gated: flags interim hypotheses delivered as transcripts', () => {
  fires(interimGated, {
    'src/listen.js': `const rec = new webkitSpeechRecognition();
rec.interimResults = true;
rec.onresult = (event) => {
  deliver(event.results[event.resultIndex][0].transcript);
};
`,
  }, /interim/i);
});

test('stt-interim-results-gated: quiet when the handler gates on isFinal', () => {
  quiet(interimGated, {
    'src/listen.js': `const rec = new webkitSpeechRecognition();
rec.interimResults = true;
rec.onresult = (event) => {
  const result = event.results[event.resultIndex];
  if (result.isFinal === false) { stillSpeaking(); return; }
  deliver(result[0].transcript);
};
`,
  });
});

test('stt-terminal-handlers: flags a recognizer wired for result alone', () => {
  fires(terminalHandlers, {
    'src/listen.js': `const rec = new webkitSpeechRecognition();
rec.onresult = (event) => deliver(event.results[0][0].transcript);
rec.start();
`,
  }, /never end or error/);
});

test('stt-terminal-handlers: quiet when both wiring forms are mixed', () => {
  quiet(terminalHandlers, {
    'src/listen.js': `const rec = new webkitSpeechRecognition();
rec.onresult = (event) => deliver(event.results[0][0].transcript);
rec.addEventListener('end', () => settle('no-speech'));
rec.addEventListener('error', (e) => settle(kindOf(e.error)));
rec.start();
`,
  });
});

test('tts-speak-settles: flags a chrome.tts handler that only resolves on end', () => {
  fires(speakSettles, {
    'src/speak.js': `export const say = (text) => new Promise((resolve) => {
  chrome.tts.speak(text, {
    enqueue: false,
    onEvent(event) { if (event.type === 'end') resolve(); },
  });
});
`,
  }, /interrupted/);
});

test('tts-speak-settles: quiet when every terminal type settles the promise', () => {
  quiet(speakSettles, {
    'src/speak.js': `export const say = (text) => new Promise((resolve) => {
  chrome.tts.speak(text, {
    enqueue: false,
    onEvent(event) {
      if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) resolve();
    },
  });
});
`,
  });
});

test('tts-speak-settles: flags a SpeechSynthesisUtterance wired for end without error', () => {
  fires(speakSettles, {
    'src/fallback.js': `export const say = (text) => new Promise((resolve) => {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => resolve();
  speechSynthesis.speak(utterance);
});
`,
  }, /no error handler/);
});

// The delegating wrapper is the shape a grep for `.speak(` gets wrong: the
// terminal handling lives in the callee, so there is nothing here to judge.
test('tts-speak-settles: quiet on a wrapper that supplies no onEvent of its own', () => {
  quiet(speakSettles, {
    'src/prompt.js': `import { say } from './speak.js';
export const prompt = (line) => say(line, { rate: 1.1 });
`,
  });
});
