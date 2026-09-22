import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { loadPacks } from '../../../engine/pack_loader/pack-registry.mjs';
import rule from '../worldRules/seeded-file-stale.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';

const PACK = '.claudinite/local/packs/mypack';
const DEST = '.github/workflows/mypack.yml';
const TEMPLATE = `${PACK}/stubs/mypack.yml`;

const packMjs = (seeds = true) => `export default {
  id: 'mypack',
  ${seeds ? "seedOps: [{ template: 'stubs/mypack.yml', dest: '.github/workflows/mypack.yml' }]," : ''}
};
`;

// The reshape this rule exists for, in miniature: the pack moved the module its stub
// invokes, and a member seeded before the move still names the old path.
const CURRENT = `# Deploy the thing.
name: mypack

on:
  workflow_dispatch:

jobs:
  go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: node .claudinite/shared/packs/mypack/tooling/build.mjs
`;

const ADOPTION_ERA = `# Deploy the thing.
name: mypack

on:
  workflow_dispatch:

jobs:
  go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: node .claudinite/shared/packs/mypack/build.mjs
`;

async function run(files) {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['local/mypack'] }, null, 2), ...files } });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    ctx.packs = await loadPacks({ localRoot: root });
    return runRule(rule, ctx);
  } finally { cleanup(root); }
}

test('a member whose seeded copy predates the template reshape is told, with the line', async () => {
  const found = await run({ [`${PACK}/pack.mjs`]: packMjs(), [TEMPLATE]: CURRENT, [DEST]: ADOPTION_ERA });
  assert.equal(found.length, 1);
  assert.equal(found[0].file, DEST);
  assert.match(found[0].what, /tooling\/build\.mjs/, 'the finding names the line the copy is missing');
  assert.match(found[0].fix, new RegExp(`cp ${PACK}/stubs/mypack\\.yml ${DEST.replace('.', '\\.')}`));
  assert.match(found[0].fix, /converge cannot push to \.github\/workflows/);
});

test('a copy carrying every template line is silent, however it was reworded or extended', async () => {
  // Re-commented, and with a step of the member's own inserted AHEAD of the template's
  // — which is what makes this a subset test rather than a line-for-line one.
  const edited = CURRENT
    .replace('# Deploy the thing.', '# Deploys the thing. Edited by us.')
    .replace('      - uses: actions/checkout@v5', '      - run: echo ours\n      - uses: actions/checkout@v5');
  assert.deepEqual(await run({ [`${PACK}/pack.mjs`]: packMjs(), [TEMPLATE]: CURRENT, [DEST]: edited }), []);
});

// The two absences that are not staleness. A repo that never seeded the file has
// nothing to be behind, and a mount missing the template is a broken mount — reported
// by whatever guards the mount, not as a finding against the member's own file.
test('no seeded file and no template are both silent', async () => {
  assert.deepEqual(await run({ [`${PACK}/pack.mjs`]: packMjs(), [TEMPLATE]: CURRENT }), []);
  assert.deepEqual(await run({ [`${PACK}/pack.mjs`]: packMjs(), [DEST]: ADOPTION_ERA }), []);
});

test('a pack that seeds nothing is not scanned', async () => {
  assert.deepEqual(await run({ [`${PACK}/pack.mjs`]: packMjs(false), [DEST]: ADOPTION_ERA }), []);
});
