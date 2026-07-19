import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import rule from './pack-independence.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

test('flags a pack importing another pack\'s code, at the import\'s line', () => {
  const root = makeRepo({
    base: {
      'packs/consumer/check.mjs': "// a comment line\nimport { helper } from '../provider/engine.mjs';\n",
      'packs/provider/engine.mjs': 'export const helper = 1;\n',
    },
  });
  const findings = run(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'pack-independence');
  assert.equal(findings[0].file, 'packs/consumer/check.mjs');
  assert.equal(findings[0].line, 2);
  assert.match(findings[0].what, /packs\/provider/);
  assert.match(findings[0].fix, /requires/);
  cleanup(root);
});

test('quiet on own-pack, checks/lib, and machinery-root imports', () => {
  const root = makeRepo({
    base: {
      'packs/alpha/check.mjs': [
        "import { helper } from './lib.mjs';",
        "import { finding } from '../../checks/lib/findings.mjs';",
        "import { SHARED } from '../registry.mjs';",
        "import { mounts } from '../../skills/registry.mjs';",
        '',
      ].join('\n'),
      'packs/alpha/lib.mjs': 'export const helper = 1;\n',
      'checks/lib/findings.mjs': 'export const finding = 1;\n',
      'packs/registry.mjs': 'export const SHARED = 1;\n',
      'skills/registry.mjs': 'export const mounts = 1;\n',
    },
  });
  assert.deepEqual(run(root), []);
  cleanup(root);
});

test('flags a pack importing a canon-internal tree (outside the engine surface)', () => {
  const root = makeRepo({
    base: {
      'packs/alpha/check.mjs': "import { active } from '../../migrations/registry.mjs';\n",
      'migrations/registry.mjs': 'export const active = 1;\n',
    },
  });
  const findings = run(root);
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /outside the vendored engine surface/);
  assert.match(findings[0].fix, /checks\/lib/);
  cleanup(root);
});

test('a dangling specifier and a test file are both out of scope', () => {
  const root = makeRepo({
    base: {
      'packs/alpha/check.mjs': "import { gone } from '../ghost/missing.mjs';\n",
      'packs/alpha/pack.test.mjs': "import x from '../other/engine.mjs';\n",
      'packs/other/engine.mjs': 'export default 1;\n',
    },
  });
  assert.deepEqual(run(root), []);
  cleanup(root);
});

test('local packs: sibling local packs and vendored pack internals are barred; the vendored engine surface and project code are not', () => {
  const root = makeRepo({
    base: {
      '.claudinite/local_packs/mine/check.mjs': [
        "import { ok } from '../../shared/checks/lib/findings.mjs';", // engine surface — allowed
        "import { own } from './lib.mjs';", // own pack — allowed
        "import { app } from '../../../src/util.mjs';", // the project's own code — not this rule's business
        "import { sib } from '../other/check.mjs';", // sibling local pack — barred
        "import { eng } from '../../shared/packs/provider/engine.mjs';", // vendored pack internals — barred
        '',
      ].join('\n'),
      '.claudinite/local_packs/mine/lib.mjs': 'export const own = 1;\n',
      '.claudinite/local_packs/other/check.mjs': 'export const sib = 1;\n',
      '.claudinite/shared/checks/lib/findings.mjs': 'export const ok = 1;\n',
      '.claudinite/shared/packs/provider/engine.mjs': 'export const eng = 1;\n',
      'src/util.mjs': 'export const app = 1;\n',
    },
  });
  const findings = run(root);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => /local_packs\/other/.test(f.what)));
  assert.ok(findings.some((f) => /packs\/provider/.test(f.what)));
  cleanup(root);
});

// --- check-the-work: the owner-mandated ordering held on the branch commit log ---
//
// The rule that outlaws the cross-pack imports was required to land BEFORE the
// commits that fix them (rule first, then the fix — the ordering the owner
// mandated when this rule was codified; checks/DESIGN.md, "a rule that mandates
// an ordering ships its check-the-work verification"). Verified here against
// the real history: for each import site the rule outlawed, the commit that
// introduced this check file must be an ancestor of (or the same commit as)
// the first commit at which that site stopped carrying the import. While a
// site still carries it, the ordering is vacuous — the pack-independence check
// itself is what flags the unfixed misuse — and after a squash-merge both land
// in one commit, which satisfies "no later than" by identity. Skips cleanly
// where history is unavailable (a shallow CI clone).

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
};

// The import sites this rule outlawed when it was codified, by their outlawed
// specifier fragment.
const OUTLAWED = [
  { file: 'packs/basics/claudinite-isolation.mjs', needle: 'barriers/engine.mjs' },
  { file: 'packs/product-wiki/isolation.mjs', needle: 'barriers/engine.mjs' },
  { file: 'packs/product-wiki/lib.mjs', needle: 'barriers/engine.mjs' },
  { file: 'packs/chrome-extension-release/release-workflows.mjs', needle: 'migrations/registry.mjs' },
];

test('check-the-work: the rule commit precedes each misuse-fix commit on the log', (t) => {
  const ruleLog = git('log', '--follow', '--diff-filter=A', '--format=%H', '--', 'packs/basics/pack-independence.mjs');
  const ruleCommit = ruleLog?.trim().split('\n').filter(Boolean).at(-1);
  if (!ruleCommit) return t.skip('history unavailable (shallow clone or detached tree)');
  for (const { file, needle } of OUTLAWED) {
    const history = (git('log', '--reverse', '--format=%H', '--', file) ?? '').trim().split('\n').filter(Boolean);
    if (!history.length) continue;
    // The first commit at which the site no longer carries the outlawed import,
    // after having carried it — i.e. the fix commit.
    let carried = false;
    let fixCommit = null;
    for (const sha of history) {
      const content = git('show', `${sha}:${file}`);
      if (content === null) continue;
      const has = content.includes(needle);
      if (has) carried = true;
      else if (carried) { fixCommit = sha; break; }
    }
    if (!fixCommit) continue; // not yet fixed (vacuous) — the check itself flags the live misuse
    const ordered = fixCommit === ruleCommit
      || git('merge-base', '--is-ancestor', ruleCommit, fixCommit) !== null;
    assert.ok(ordered,
      `${file}: the fix commit ${fixCommit.slice(0, 7)} landed before the rule commit ${ruleCommit.slice(0, 7)} — the outlawing rule must land first`);
  }
});
