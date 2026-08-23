// Red-first fixtures for host-page-adaptation's two checks. Every rule must
// FIRE on a violating source and stay QUIET on a clean one; the parsing each
// one does is shown NECESSARY (not just correct) by also confirming a naive
// whole-file grep would have false-alarmed on the quiet cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import pageObserversDisconnected from '../worldRules/page-observers-disconnected.mjs';
import syntheticInputEventsBubble from '../worldRules/synthetic-input-events-bubble.mjs';
import {
  isSource, balanced, inputEventCtors, eventConstructions, hasSpread,
} from '../lib.mjs';

function run(rule, root) {
  return runRule(rule, buildContext({ root, mode: 'all' }));
}

// The scan must be repo-shape agnostic: a rule that only ever looks under one
// project's source root matches nothing — and passes vacuously green — in a
// repo laid out differently, which is exactly the bug these cases prevent.
test('isSource: accepts browser source under any layout, in JS and TS alike', () => {
  for (const file of [
    'extension/src/page-adapter/writer.js',
    'src/adapter.ts',
    'app/lib/host.tsx',
    'packages/web/inject.mjs',
    'userscript.cjs',
  ]) assert.equal(isSource(file), true, file);
});

test('isSource: rejects test scaffolding, fixtures and vendored code wherever they sit', () => {
  for (const file of [
    'extension-test/integration/page-adapter.test.js',
    'extension-test/fixtures/fake-host/fake-app.js',
    'src/adapter.spec.ts',
    'test/host.js',
    'node_modules/x/index.js',
    'dist/content.js',
    'README.md',
  ]) assert.equal(isSource(file), false, file);
});

test('page-observers-disconnected: fires on an observer started and never disconnected', () => {
  const root = makeRepo({ changed: {
    'src/mount.js': `
      export function watch(document, onChange) {
        const observer = new MutationObserver(onChange);
        observer.observe(document.body, { childList: true, subtree: true });
      }
    `,
  } });
  try {
    const found = run(pageObserversDisconnected, root);
    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'page-observers-disconnected');
    assert.equal(found[0].file, 'src/mount.js');
    assert.equal(found[0].severity, 'blocking');
  } finally { cleanup(root); }
});

test('page-observers-disconnected: fires on an IntersectionObserver and a ResizeObserver too', () => {
  for (const cls of ['IntersectionObserver', 'ResizeObserver']) {
    const root = makeRepo({ changed: { 'app/host.ts': `const o = new ${cls}(cb); o.observe(el);` } });
    try {
      assert.equal(run(pageObserversDisconnected, root).length, 1, cls);
    } finally { cleanup(root); }
  }
});

test('page-observers-disconnected: fires when the observer is constructed off a window reference', () => {
  const root = makeRepo({ changed: {
    'src/mount.js': `
      const view = document.defaultView;
      const observer = new view.MutationObserver(schedule);
      observer.observe(document.documentElement, { subtree: true, childList: true });
    `,
  } });
  try {
    assert.equal(run(pageObserversDisconnected, root).length, 1);
  } finally { cleanup(root); }
});

test('page-observers-disconnected: quiet when the observer disconnects (one-shot mount)', () => {
  const root = makeRepo({ changed: {
    'src/mount.js': `
      export function mountWhenReady(document, place) {
        const observer = new MutationObserver(() => {
          const host = document.querySelector('[class*="toolbar"]');
          if (!host) return;
          observer.disconnect();
          place(host);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    `,
  } });
  try {
    assert.deepEqual(run(pageObserversDisconnected, root), []);
  } finally { cleanup(root); }
});

test('page-observers-disconnected: quiet when an observer is constructed but never started', () => {
  const root = makeRepo({ changed: { 'src/factory.js': 'export const makeObserver = (cb) => new MutationObserver(cb);' } });
  try {
    assert.deepEqual(run(pageObserversDisconnected, root), []);
  } finally { cleanup(root); }
});

test('page-observers-disconnected: quiet on a comment that merely names the trap', () => {
  const root = makeRepo({ changed: {
    'src/notes.js': `
      // A MutationObserver started here would need observer.observe(...) and
      // an observer.disconnect() in teardown.
      export const nothing = 1;
    `,
  } });
  try {
    assert.deepEqual(run(pageObserversDisconnected, root), []);
  } finally { cleanup(root); }
});

test('page-observers-disconnected: quiet in test scaffolding that leaves its observer to the runner', () => {
  const root = makeRepo({ changed: { 'test/watch.test.js': 'const o = new MutationObserver(cb); o.observe(document.body, {});' } });
  try {
    assert.deepEqual(run(pageObserversDisconnected, root), []);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: fires on an input event dispatched with no init at all', () => {
  const root = makeRepo({ changed: { 'src/drive.js': "el.dispatchEvent(new MouseEvent('click'));" } });
  try {
    const found = run(syntheticInputEventsBubble, root);
    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'synthetic-input-events-bubble');
    assert.match(found[0].what, /MouseEvent/);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: fires on an init that omits bubbles', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': "target.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', keyCode: 65, which: 65 }));",
  } });
  try {
    assert.equal(run(syntheticInputEventsBubble, root).length, 1);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: fires on an explicit bubbles: false', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': "el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: false, cancelable: true }));",
  } });
  try {
    assert.equal(run(syntheticInputEventsBubble, root).length, 1);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: fires through a one-hop constructor alias — the generic fire() helper', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': `
      function fire(el, type, init) {
        const Ctor = type.startsWith('key') ? window.KeyboardEvent : window.MouseEvent;
        el.dispatchEvent(new Ctor(type, { cancelable: true, composed: true }));
      }
    `,
  } });
  try {
    assert.equal(run(syntheticInputEventsBubble, root).length, 1);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: fires through one variable hop — built into a local, dispatched by name', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': "const ev = new MouseEvent('click', { cancelable: true });\nel.dispatchEvent(ev);",
  } });
  try {
    const found = run(syntheticInputEventsBubble, root);
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 1); // the construction, where the fix goes
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: quiet when the locally built event sets bubbles: true', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': "const ev = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });\nel.dispatchEvent(ev);",
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: quiet when the dispatched local is built by a call the check cannot read', () => {
  const root = makeRepo({ changed: {
    // `ev` constructs nothing readable; `template` is constructed but never dispatched.
    'src/drive.js': "const ev = makeEvent('click');\nel.dispatchEvent(ev);\nconst template = new MouseEvent('click');",
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: quiet when bubbles: true is set', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': "el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));",
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []);
  } finally { cleanup(root); }
});

test("synthetic-input-events-bubble: quiet on an aliased constructor whose init spreads the caller's fields", () => {
  const root = makeRepo({ changed: {
    'src/drive.js': `
      function fire(el, type, init) {
        const Ctor = type.startsWith('key') ? view.KeyboardEvent : view.MouseEvent;
        el.dispatchEvent(new Ctor(type, { ...init }));
      }
    `,
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: quiet on a CustomEvent — your own signal has no fidelity contract', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': "el.dispatchEvent(new CustomEvent('app:ready', { detail: { ok: true } }));",
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: quiet on an event that is constructed but never dispatched', () => {
  const root = makeRepo({ changed: {
    'src/drive.js': "const probe = new MouseEvent('click'); export const supported = Boolean(probe); el.dispatchEvent(new CustomEvent('x'));",
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []);
  } finally { cleanup(root); }
});

test('synthetic-input-events-bubble: quiet on a comment describing the trap', () => {
  const root = makeRepo({ changed: {
    'src/notes.js': `
      // Do not write el.dispatchEvent(new MouseEvent('click')) — bubbles defaults to false.
      export const nothing = 1;
    `,
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []);
  } finally { cleanup(root); }
});

// The parsing has to be shown NECESSARY, not just correct: the quiet fixtures
// above would all fire under a naive whole-file grep for an event construction.
test('the parsing earns its keep: a whole-file grep would false-alarm on the quiet cases', () => {
  const NAIVE = /new\s+\w*Event\s*\(/;
  const quiet = [
    "el.dispatchEvent(new CustomEvent('app:ready', { detail: { ok: true } }));",
    "const probe = new MouseEvent('click'); el.dispatchEvent(new CustomEvent('x'));",
    "el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));",
  ];
  for (const src of quiet) assert.equal(NAIVE.test(src), true, src); // the naive rule fires...
  const root = makeRepo({ changed: {
    'src/a.js': quiet[0],
    'src/b.js': quiet[1],
    'src/c.js': quiet[2],
  } });
  try {
    assert.deepEqual(run(syntheticInputEventsBubble, root), []); // ...the real rule stays quiet on all three
  } finally { cleanup(root); }
});

// lib.mjs pure-function coverage beyond what the two rules exercise end to end.
test('lib: balanced returns null on unbalanced source', () => {
  assert.equal(balanced('foo(bar', 3), null);
});

test('lib: inputEventCtors follows a one-hop alias but not a two-hop one', () => {
  const ctors = inputEventCtors('const Ctor = MouseEvent; const Indirect = Ctor;');
  assert.equal(ctors.has('Ctor'), true);
  assert.equal(ctors.has('Indirect'), false);
});

test('lib: eventConstructions finds a construction with no init and one with an init', () => {
  const src = "new MouseEvent('click'); new MouseEvent('click', { bubbles: true });";
  const found = eventConstructions(src, new Set(['MouseEvent']));
  assert.equal(found.length, 2);
  assert.equal(found[0].init, null);
  assert.match(found[1].init, /bubbles: true/);
});

test('lib: hasSpread is true only when the init literal spreads something', () => {
  assert.equal(hasSpread('{ ...init }'), true);
  assert.equal(hasSpread('{ bubbles: true }'), false);
  assert.equal(hasSpread(null), false);
});
