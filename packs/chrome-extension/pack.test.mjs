import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import setIcon from './declarative-content-set-icon.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const worker = (body) => makeRepo({ changed: { 'sw.js': body } });

test('declarative-content-set-icon: flags a SetIcon built from a path', () => {
  const root = worker(`chrome.declarativeContent.onPageChanged.addRules([{
  conditions: [new chrome.declarativeContent.PageStateMatcher({})],
  actions: [new chrome.declarativeContent.SetIcon({ path: 'icons/on-16.png' })],
}]);
`);
  try {
    const findings = run(setIcon, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'sw.js');
    assert.equal(findings[0].line, 3);
    assert.match(findings[0].fix, /imageData/);
  } finally { cleanup(root); }
});

test('declarative-content-set-icon: flags a per-size path map and a quoted key', () => {
  const root = worker(`const a = new chrome.declarativeContent.SetIcon({ path: { 16: 'a.png', 32: 'b.png' } });
const b = new chrome.declarativeContent.SetIcon({ 'path': 'c.png' });
`);
  try {
    assert.equal(run(setIcon, root).length, 2);
  } finally { cleanup(root); }
});

test('declarative-content-set-icon: clean when the action supplies imageData', () => {
  const root = worker(`const icon = new chrome.declarativeContent.SetIcon({ imageData: bitmap });
`);
  try {
    assert.equal(run(setIcon, root).length, 0);
  } finally { cleanup(root); }
});

test('declarative-content-set-icon: NOT flagged for chrome.action.setIcon (FP guard)', () => {
  // action.setIcon documents and honors `path` — only the declarativeContent
  // action class (capital S) is broken by it.
  const root = worker(`chrome.action.setIcon({ path: 'icons/on-16.png' });
chrome.browserAction.setIcon({ path: { 16: 'a.png' } });
`);
  try {
    assert.equal(run(setIcon, root).length, 0);
  } finally { cleanup(root); }
});

test('declarative-content-set-icon: NOT flagged for a nested or neighbouring path (FP guard)', () => {
  // `path` deeper than the argument's own top level, and a path-bearing object
  // passed to something else entirely, are not this rule's business.
  const root = worker(`new chrome.declarativeContent.SetIcon({ imageData: await decode({ path: 'a.png' }) });
fetch(chrome.runtime.getURL(manifest.icons.path));
`);
  try {
    assert.equal(run(setIcon, root).length, 0);
  } finally { cleanup(root); }
});

test('declarative-content-set-icon: NOT flagged inside a comment (FP guard)', () => {
  const root = worker(`// never write new chrome.declarativeContent.SetIcon({ path: 'x.png' })
/* nor here: chrome.declarativeContent.SetIcon({ path: 'y.png' }) */
`);
  try {
    assert.equal(run(setIcon, root).length, 0);
  } finally { cleanup(root); }
});
