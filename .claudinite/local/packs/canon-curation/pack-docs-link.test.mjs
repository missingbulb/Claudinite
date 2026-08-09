import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import packDocsLink from './pack-docs-link.mjs';

const run = (root) => packDocsLink.run(buildContext({ root, mode: 'all' }));

const DOC = 'docs/per-project-scheduling/DESIGN.md';
const CANON_DOC = { [DOC]: '# design\n' };

test('pack-no-docs-link: a pack file linking into docs/ is flagged', () => {
  const root = makeRepo({ changed: {
    ...CANON_DOC,
    'packs/demo/RULES.md': '# demo\n\nHow it runs ([DESIGN](../../docs/per-project-scheduling/DESIGN.md)).\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'packs/demo/RULES.md');
    assert.equal(findings[0].line, 3);
    assert.match(findings[0].what, /docs\/per-project-scheduling\/DESIGN\.md/);
  } finally { cleanup(root); }
});

// The same reference with no link is the prescribed remedy — the finding's fix
// line says so, and the check must accept what it asks for.
test('pack-no-docs-link: naming the document without linking is clean', () => {
  const root = makeRepo({ changed: {
    ...CANON_DOC,
    'packs/demo/RULES.md': "# demo\n\nHow it runs (the canon's per-project-scheduling DESIGN).\n",
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

// A pack file reaching a sibling pack is the ordinary case and stays quiet:
// only the un-vendored docs/ tree is the defect.
test('pack-no-docs-link: an in-tree link between packs is clean', () => {
  const root = makeRepo({ changed: {
    ...CANON_DOC,
    'packs/demo/RULES.md': '# demo\n\nSee [scheduled-tasks.md](../basics/scheduled-tasks.md).\n',
    'packs/basics/scheduled-tasks.md': '# tasks\n',
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

// A pack's OWN docs/ subdirectory ships with the pack — resolution, not a
// substring match, is what tells the two apart.
test("pack-no-docs-link: a pack's own docs/ subdirectory is not the canon docs/ tree", () => {
  const root = makeRepo({ changed: {
    'packs/demo/RULES.md': '# demo\n\nSee [the note](docs/note.md).\n',
    'packs/demo/docs/note.md': '# note\n',
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

// packs/README.md is the catalog at the root of the tree, outside every pack
// directory, so no vendor walk carries it and its docs/ links resolve for their
// only reader.
test('pack-no-docs-link: the packs/ catalog itself is out of scope', () => {
  const root = makeRepo({ changed: {
    ...CANON_DOC,
    'packs/README.md': '# catalog\n\nThe audit: [conversion-inventory.md](../docs/conversion-inventory.md).\n',
    'docs/conversion-inventory.md': '# audit\n',
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

// A local pack is never vendored anywhere, so its docs/ link resolves for
// everyone who can read it.
test('pack-no-docs-link: a local pack may link into docs/', () => {
  const root = makeRepo({ changed: {
    ...CANON_DOC,
    '.claudinite/local/packs/demo/RULES.md': '# demo\n\nSee [DESIGN](../../../../docs/per-project-scheduling/DESIGN.md).\n',
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('pack-no-docs-link: an external URL naming docs/ is not a repo path', () => {
  const root = makeRepo({ changed: {
    'packs/demo/RULES.md': '# demo\n\nSee [the guide](https://example.com/docs/per-project-scheduling/DESIGN.md).\n',
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});
