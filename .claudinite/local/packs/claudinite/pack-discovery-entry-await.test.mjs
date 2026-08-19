import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import rule from './pack-discovery-entry-await.mjs';

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

const packModule = (id, imports = '') =>
  `${imports}export default { id: '${id}', prose: 'RULES.md', worldRules: [] };\n`;

// The #581 shape: a helper that is both imported by a skill's checks manifest and
// runnable as a CLI, awaiting its own work at the top level of the entry block.
const cliModule = (body) => `import { pathToFileURL } from 'node:url';

export function state() { return []; }
async function check() { return state(); }

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  ${body}
}
`;

test('pack-discovery-entry-await: fires on a top-level await in a module a skill checks.mjs imports', () => {
  const root = makeRepo({
    base: {
      'packs/claudinite-growth/pack.mjs': packModule('claudinite-growth'),
      'packs/claudinite-growth/skills/adopt/checks.mjs':
        "import { state } from './interview.mjs';\nexport default [state];\n",
      'packs/claudinite-growth/skills/adopt/interview.mjs': cliModule('await check();'),
    },
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'pack-discovery-entry-await');
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'packs/claudinite-growth/skills/adopt/interview.mjs');
    assert.match(findings[0].fix, /\.catch\(/);
  } finally {
    cleanup(root);
  }
});

test('pack-discovery-entry-await: follows the graph transitively through a pack.mjs', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.mjs': packModule('basics', "import './cli.mjs';\n"),
      'packs/basics/cli.mjs': cliModule('await check();'),
    },
  });
  try {
    assert.equal(run(root).length, 1);
  } finally {
    cleanup(root);
  }
});

test('pack-discovery-entry-await: the safe form — work started after evaluation — is quiet', () => {
  const root = makeRepo({
    base: {
      'packs/claudinite-growth/pack.mjs': packModule('claudinite-growth'),
      'packs/claudinite-growth/skills/adopt/checks.mjs':
        "import { state } from './interview.mjs';\nexport default [state];\n",
      'packs/claudinite-growth/skills/adopt/interview.mjs':
        cliModule("check().catch((e) => process.stderr.write(`${e.message}\\n`));"),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('pack-discovery-entry-await: a CLI worker outside the discovery graph may await at top level', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.mjs': packModule('basics'),
      // Nothing in the pack tree imports it — the scheduler spawns it as a process.
      'packs/claudinite-lifecycle/tasks/update/worker.mjs': cliModule('await check();'),
      'engine/scheduler/queue/executor.mjs': cliModule('await check();'),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('pack-discovery-entry-await: a dynamic import is not followed — it is what makes the cycle harmless', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.mjs': packModule('basics', "const load = () => import('./cli.mjs');\n"),
      'packs/basics/cli.mjs': cliModule('await check();'),
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('pack-discovery-entry-await: prose and code samples about the trap cannot fire it', () => {
  const root = makeRepo({
    base: {
      'packs/basics/pack.mjs': packModule('basics', "import './cli.mjs';\n"),
      'packs/basics/cli.mjs': `import { pathToFileURL } from 'node:url';
async function check() { return []; }
// NEVER write \`await check()\` here — if (import.meta.url === ...) { await check(); }
const sample = \`if (import.meta.url === x) { await check(); }\`;
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  check().catch(() => {});
  void sample;
}
`,
    },
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('pack-discovery-entry-await: a repo with no pack tree is silent', () => {
  const root = makeRepo({ base: { 'src/index.mjs': cliModule('await check();') } });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});
