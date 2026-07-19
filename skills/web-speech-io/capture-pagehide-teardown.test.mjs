import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import captureReleasedOnPagehide from './capture-pagehide-teardown.mjs';

// Co-located with the check it exercises. check-the-world: the whole tracked
// source is the scope, so the fixtures run in mode 'all'.
const run = (root) => captureReleasedOnPagehide.run(buildContext({ root, mode: 'all' }));

test('web-speech-capture-released-on-pagehide: getUserMedia with no pagehide anywhere is blocking', () => {
  const root = makeRepo({ changed: {
    'src/mic.js': `const s = await navigator.mediaDevices.getUserMedia({ audio: true });\ns.getTracks().forEach((t) => t.stop());\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'src/mic.js');
    assert.equal(findings[0].line, 1);
    assert.match(findings[0].fix, /pagehide/);
  } finally { cleanup(root); }
});

test('web-speech-capture-released-on-pagehide: a live recognizer with no pagehide is flagged at the recognizer line', () => {
  const root = makeRepo({ changed: {
    'src/stt.js': `const Rec = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;\nconst rec = new Rec();\nrec.start();\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'src/stt.js');
    assert.equal(findings[0].line, 1); // anchored on the recognizer reference
  } finally { cleanup(root); }
});

test('web-speech-capture-released-on-pagehide: a pagehide teardown ANYWHERE in the repo clears it', () => {
  // The CrosswordChat shape after the fix: the capture is in one file, the
  // pagehide teardown that releases it is in another (the page that owns it).
  const root = makeRepo({ changed: {
    'src/stt-port.js': `const s = await media.getUserMedia({ audio: true });\ns.getTracks().forEach((t) => t.stop());\n`,
    'src/content-script.js': `window.addEventListener('pagehide', () => session?.orchestrator.stop());\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-capture-released-on-pagehide: onpagehide (property form) also satisfies it', () => {
  const root = makeRepo({ changed: {
    'src/mic.js': `const s = await navigator.mediaDevices.getUserMedia({ audio: true });\nwindow.onpagehide = () => s.getTracks().forEach((t) => t.stop());\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-capture-released-on-pagehide: a mocked getUserMedia in a test file opens no device', () => {
  const root = makeRepo({ changed: {
    'test/mic.test.js': `const nav = { mediaDevices: { getUserMedia: () => Promise.resolve(fakeStream) } };\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-capture-released-on-pagehide: a non-source file referencing getUserMedia is out of scope', () => {
  const root = makeRepo({ changed: {
    'docs/notes.md': 'Call `getUserMedia({ audio: true })` to open the mic.\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-capture-released-on-pagehide: a repo that never opens the mic is silent', () => {
  const root = makeRepo({ changed: {
    'src/app.js': `export const add = (a, b) => a + b;\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-capture-released-on-pagehide: a recognizer named but never started is not a live capture', () => {
  // Referencing the API (e.g. a type import or a comment) without .start()ing it
  // opens no device — the conservative gate would rather miss than false-flag.
  const root = makeRepo({ changed: {
    'src/types.js': `/** @param {SpeechRecognition} rec */\nexport function describe(rec) { return rec.lang; }\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
