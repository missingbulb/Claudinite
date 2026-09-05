// Red-first coverage for the three host-page checks, each exercised both ways.
//
// The quiet cases carry the weight here. All three rules describe a breach whose
// only symptom is the page not responding, so the temptation is to scan for the
// API name and be done — and every quiet case below is a spelling that scan
// would flag: an observer disconnected elsewhere in the file, a `CustomEvent`
// you dispatch to your own listener, an init object spread from a shared helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';

import observersDisconnected from '../worldRules/page-observers-disconnected.mjs';
import eventsBubble from '../worldRules/synthetic-input-events-bubble.mjs';
import eventsTargetAppNode from '../worldRules/synthetic-input-events-target-app-node.mjs';

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

test('page-observers-disconnected: flags an observer the file never disconnects', () => {
  fires(observersDisconnected, {
    'src/watcher.js': `export function watch(root, onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { childList: true, subtree: true });
}
`,
  }, /disconnect/);
});

test('page-observers-disconnected: quiet when the file disconnects somewhere', () => {
  quiet(observersDisconnected, {
    'src/watcher.js': `export function watch(root, onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
`,
  });
});

test('synthetic-input-events-bubble: flags an input event constructed without bubbles', () => {
  fires(eventsBubble, {
    'src/writer.js': `export const click = (cell) => cell.dispatchEvent(new MouseEvent('click'));
`,
  }, /does not bubble/);
});

test('synthetic-input-events-bubble: quiet once bubbles is set', () => {
  quiet(eventsBubble, {
    'src/writer.js': `export const click = (cell) =>
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
`,
  });
});

// A CustomEvent is your own signal to your own listener — it carries no
// delegation contract, so neither event rule has anything to say about it.
test('synthetic-input-events-bubble: quiet on a CustomEvent', () => {
  quiet(eventsBubble, {
    'src/bus.js': `export const announce = (el) => el.dispatchEvent(new CustomEvent('cc:ready'));
`,
  });
});

test('synthetic-input-events-target-app-node: flags an input event aimed at document', () => {
  fires(eventsTargetAppNode, {
    'src/writer.js': `export const type = (key) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
`,
  }, /document/);
});

test('synthetic-input-events-target-app-node: quiet when the receiver is a node in the app', () => {
  quiet(eventsTargetAppNode, {
    'src/writer.js': `export const type = (cell, key) =>
  cell.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
`,
  });
});
