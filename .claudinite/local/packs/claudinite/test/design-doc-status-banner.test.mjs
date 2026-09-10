import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../../../engine/checks/helpers/pattern-rules.mjs';

const rule = loadDeclaredChecks(
  fileURLToPath(new URL('..', import.meta.url)),
).find((r) => r.id === 'design-doc-status-banner');

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));
const at = (files) => makeRepo({ base: files });
const BANNER = '> **Status: not implemented.** A proposal, not a description of this repository.';

test('design-doc-status-banner: a banner on the first screen passes', () => {
  const root = at({ 'docs/thing/DESIGN.md': `# Thing — design\n\n${BANNER}\n\nBody.\n` });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('design-doc-status-banner: "in flight" is the other accepted status', () => {
  const root = at({ 'docs/thing/DESIGN.md': '# Thing\n\n> **Status: in flight.** Half of it exists.\n' });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('design-doc-status-banner: a doc with no banner is reported', () => {
  const root = at({ 'docs/thing/DESIGN.md': '# Thing — design\n\nStraight into the mechanism.\n' });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].fix, /Status: not implemented/);
  } finally { cleanup(root); }
});

// A warning below the fold is not a warning: the reader who skims the opening
// paragraphs is exactly the reader who takes a proposal for the current state.
test('design-doc-status-banner: a banner past the first screen does not count', () => {
  const root = at({ 'docs/thing/DESIGN.md': `# Thing\n\n${'Filler paragraph.\n\n'.repeat(6)}${BANNER}\n` });
  try { assert.equal(run(root).length, 1); } finally { cleanup(root); }
});

// The same initiative shape appears under a pack's own docs/; a design doc beside
// the code it describes (engine/checks/, vendoring/) is a different class and out.
test('design-doc-status-banner: scope is the initiative shape, under a pack too', () => {
  const root = at({
    'packs/p/docs/thing/DESIGN.md': '# Thing\n\nNo banner.\n',
    'engine/checks/DESIGN.md': '# Architecture record\n\nNo banner.\n',
    'vendoring/DESIGN.md': '# Architecture record\n\nNo banner.\n',
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].file, /^packs\/p\/docs\/thing\/DESIGN\.md$/);
  } finally { cleanup(root); }
});

// A pattern left behind by a layout change matches nothing and still reads as live,
// so the scope is measured over the real tree — with the declaration's own regex,
// never a second copy of it here, which would go on passing after the real one moved.
test('design-doc-status-banner: the scope is non-empty against the real tree', () => {
  const root = fileURLToPath(new URL('../../../../..', import.meta.url));
  const tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n');
  assert.ok(tracked.filter((p) => rule.spec.scanFiles.test(p)).length >= 4);
});
