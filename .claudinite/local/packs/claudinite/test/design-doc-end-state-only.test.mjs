import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../../../engine/checks/helpers/pattern-rules.mjs';

const rule = loadDeclaredChecks(
  fileURLToPath(new URL('..', import.meta.url)),
).find((r) => r.id === 'design-doc-end-state-only');

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));
const at = (files) => makeRepo({ base: files });
const doc = (body) => ({ 'docs/thing/DESIGN.md': `# Thing — end state\n\n${body}` });

test('design-doc-end-state-only: end state, rationale and alternatives pass', () => {
  const root = at(doc([
    '## 1. Shape',
    'What it is.',
    '## 2. Who reads it',
    'Everyone.',
    '## Alternatives considered',
    'The other design, and why it loses.',
  ].join('\n\n')));
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('design-doc-end-state-only: a migration section is reported', () => {
  const root = at(doc('## 9. Migration\n\nPhased rollout, tracked here.\n'));
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /9\. Migration/);
  } finally { cleanup(root); }
});

test('design-doc-end-state-only: prior-state narrative is reported', () => {
  const root = at(doc([
    '## 1. Why the current mechanism has an agentic stage at all',
    'A census of what we run today.',
    '## Background',
    'How we got here.',
    '### Current state',
    'What exists now.',
  ].join('\n\n')));
  try { assert.equal(run(root).length, 3); } finally { cleanup(root); }
});

test('design-doc-end-state-only: an owner-opinion section and a request are reported', () => {
  const root = at(doc([
    '## 10. Owner decisions recorded',
    'Six of them.',
    '### Owner, 2026-07-29',
    'Two more.',
    '## The request',
    'What was asked for.',
  ].join('\n\n')));
  try { assert.equal(run(root).length, 3); } finally { cleanup(root); }
});

// The banned kinds are what a section IS, which its heading leads with — a
// marker word further along names the system's own parts and is not a finding.
test('design-doc-end-state-only: a marker word mid-heading is not a section kind', () => {
  const root = at(doc([
    '### 4.3 Executor execution status — as built',
    'The three values.',
    '## 5. What the owner sees',
    'One dashboard.',
    '## 6. What this retires',
    'The old task.',
  ].join('\n\n')));
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('design-doc-end-state-only: a heading quoted inside a fence is not a section', () => {
  const root = at(doc('## 1. Shape\n\n```md\n## Background\n```\n'));
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// The doc's own title is its name, not a section kind, so h1 is out of the match.
test('design-doc-end-state-only: the h1 title is never a finding', () => {
  const root = at({ 'docs/migration/DESIGN.md': '# Migration — end state\n\n## 1. Shape\n\nIt.\n' });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// A pattern left behind by a layout change matches nothing and still reads as live,
// so the scope is measured over the real tree — with the declaration's own regex,
// never a second copy of it here, which would go on passing after the real one moved.
test('design-doc-end-state-only: the scope is non-empty against the real tree', () => {
  const root = fileURLToPath(new URL('../../../../..', import.meta.url));
  const tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n');
  assert.ok(tracked.filter((p) => rule.spec.scanFiles.test(p)).length >= 4);
});
