import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine/test/helpers.mjs';
import { buildContext } from '../../../../engine/checks_helpers/context.mjs';
import recognitionFeatureDetect from './recognition-feature-detect.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => recognitionFeatureDetect.run(buildContext({ root, mode: 'all' }));

test('web-speech-recognition-feature-detected: a bare webkit construction is advisory', () => {
  const root = makeRepo({ changed: {
    'src/stt.js': `// listen\nconst rec = new webkitSpeechRecognition();\nrec.start();\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(findings[0].file, 'src/stt.js');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].fix, /globalThis\.SpeechRecognition/);
  } finally { cleanup(root); }
});

test('web-speech-recognition-feature-detected: an unprefixed feature-detect passes', () => {
  const root = makeRepo({ changed: {
    'src/stt.js': `const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;\nconst rec = new webkitSpeechRecognition();\n`,
  } });
  try {
    // The file mentions the unprefixed name, so it is aware of both and not scanned.
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-recognition-feature-detected: an injected constructor resolved from both names passes', () => {
  const root = makeRepo({ changed: {
    'src/stt.js':
      `export function createStt({ Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition } = {}) {\n  return new Recognition();\n}\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-recognition-feature-detected: a non-source file is out of scope', () => {
  const root = makeRepo({ changed: {
    'docs/notes.md': 'Call `new webkitSpeechRecognition()` to start.\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
