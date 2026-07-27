import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import setIconImageData from './set-icon-image-data.mjs';

const run = (root) => setIconImageData.run(buildContext({ root, mode: 'all' }));

test('chrome-extension/set-icon-image-data: a SetIcon action given path is blocking', () => {
  const root = makeRepo({ changed: {
    'src/background.js': [
      "chrome.declarativeContent.onPageChanged.addRules([{",
      "  conditions: [new chrome.declarativeContent.PageStateMatcher({ pageUrl: { hostEquals: 'example.com' } })],",
      "  actions: [new chrome.declarativeContent.SetIcon({ path: 'icons/on-128.png' })],",
      "}]);",
      "",
    ].join('\n'),
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'src/background.js');
    assert.equal(findings[0].line, 3);
    assert.match(findings[0].fix, /imageData/);
  } finally { cleanup(root); }
});

test('chrome-extension/set-icon-image-data: a quoted path key over several lines is still found', () => {
  const root = makeRepo({ changed: {
    'sw.mjs': [
      "const action = new chrome.declarativeContent.SetIcon({",
      "  'path': iconPath,",
      "});",
      "",
    ].join('\n'),
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
  } finally { cleanup(root); }
});

test('chrome-extension/set-icon-image-data: a SetIcon action given imageData is clean', () => {
  const root = makeRepo({ changed: {
    'src/background.js': [
      "const imageData = await decodeIcon(chrome.runtime.getURL('icons/on-128.png'));",
      "const action = new chrome.declarativeContent.SetIcon({ imageData });",
      "",
    ].join('\n'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('chrome-extension/set-icon-image-data: a nested path (not the action option) is clean', () => {
  const root = makeRepo({ changed: {
    'src/background.js': [
      "new chrome.declarativeContent.SetIcon({ imageData: await pixels({ path: icon }) });",
      "",
    ].join('\n'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('chrome-extension/set-icon-image-data: a comment naming the bad shape is clean', () => {
  const root = makeRepo({ changed: {
    'src/background.js': [
      "// Never: new chrome.declarativeContent.SetIcon({ path: 'icons/on.png' }) — it silently no-ops.",
      "const action = new chrome.declarativeContent.SetIcon({ imageData });",
      "",
    ].join('\n'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('chrome-extension/set-icon-image-data: some other library\'s SetIcon({ path }) is out of scope', () => {
  const root = makeRepo({ changed: {
    // Same file also drives declarativeContent, so only the call anchor — not the
    // cheap file-level bail — can keep the unrelated SetIcon out of scope.
    'src/tray.js': [
      "chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {});",
      "tray.SetIcon({ path: 'assets/tray.png' });",
      "",
    ].join('\n'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('chrome-extension/set-icon-image-data: markdown documenting the gotcha is not scanned', () => {
  const root = makeRepo({ changed: {
    'docs/extension.md': "Never call `new chrome.declarativeContent.SetIcon({ path: 'a.png' })`.\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
