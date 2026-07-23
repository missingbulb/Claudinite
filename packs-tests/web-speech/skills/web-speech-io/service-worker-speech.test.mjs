import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import serviceWorkerSpeech from '../../../../packs/web-speech/skills/web-speech-io/service-worker-speech.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => serviceWorkerSpeech.run(buildContext({ root, mode: 'all' }));

const MV3 = (sw) => JSON.stringify({ manifest_version: 3, background: { service_worker: sw } }) + '\n';

test('web-speech-no-window-api-in-service-worker: recognition in the named worker is blocking', () => {
  const root = makeRepo({ changed: {
    'extension/manifest.json': MV3('background.js'),
    'extension/background.js': `chrome.runtime.onInstalled.addListener(() => {});\nconst rec = new webkitSpeechRecognition();\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'extension/background.js');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /recognition/);
  } finally { cleanup(root); }
});

test('web-speech-no-window-api-in-service-worker: speechSynthesis in the named worker is blocking with the chrome.tts fix', () => {
  const root = makeRepo({ changed: {
    'ext/manifest.json': MV3('src/sw.js'),
    'ext/src/sw.js': `export function speak(t) {\n  speechSynthesis.speak(new SpeechSynthesisUtterance(t));\n}\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'ext/src/sw.js');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].fix, /chrome\.tts/);
  } finally { cleanup(root); }
});

test('web-speech-no-window-api-in-service-worker: a worker driving chrome.tts is clean', () => {
  const root = makeRepo({ changed: {
    'extension/manifest.json': MV3('background.js'),
    'extension/background.js': `chrome.tts.speak('hi', { enqueue: false });\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-no-window-api-in-service-worker: a bundled worker artifact (not in the source tree) is out of scope', () => {
  // The manifest names a built background.js the repo does not track; there is no
  // authored source file at that path, so the check has nothing in scope to scan.
  const root = makeRepo({ changed: {
    'extension/manifest.json': MV3('background.js'),
    'extension/src/service-worker.js': `import { speak } from '../../../../packs/web-speech/skills/web-speech-io/tts.js';\n`,
    'extension/src/tts.js': `export const speak = (t) => speechSynthesis.speak(new SpeechSynthesisUtterance(t));\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-no-window-api-in-service-worker: a non-MV3 manifest is not scanned', () => {
  const root = makeRepo({ changed: {
    'extension/manifest.json': JSON.stringify({ manifest_version: 2, background: { service_worker: 'background.js' } }) + '\n',
    'extension/background.js': `const rec = new webkitSpeechRecognition();\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('web-speech-no-window-api-in-service-worker: speech in a non-worker file (no manifest) is out of scope', () => {
  const root = makeRepo({ changed: {
    'src/content.js': `const rec = new webkitSpeechRecognition();\nspeechSynthesis.speak(new SpeechSynthesisUtterance('x'));\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
