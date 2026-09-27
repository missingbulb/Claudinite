import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRewrites } from '../../../../engine/migrations/registry.mjs';
import record from '../../migrations/2026-09-27-routine-url-variable/migration.mjs';

const SETTINGS = '.claudinite-settings.json';
const URL_1 = 'https://api.anthropic.com/v1/claude_code/routines/trig_01acme/fire';
const URL_2 = 'https://api.anthropic.com/v1/claude_code/routines/trig_02acme/fire';

// The mount a member reads the URL from its variable with, and the one it does not.
const CAPABLE = {
  '.claudinite/shared/packs/claudinite-tasks/src/world/sessions.mjs': 'export const routineUrlVariable = () => {};',
  '.claudinite/shared/engine/checks/helpers/repo-context.mjs': '"taskScheduler.x" must be an object of endpoint name → { tokenSecret }',
};

const run = async (files) => {
  const tree = { ...files };
  const io = { read: async (p) => tree[p] ?? null, write: async (p, text) => { tree[p] = text; } };
  await applyRewrites(record, io);
  return tree;
};

test('every endpoint loses its url and keeps the rest of the file byte for byte, whichever key comes first', async () => {
  const before = `{
  "packs": ["acme-pack"],
  "taskScheduler": {
    "agenticTaskInvocationEndpoints": {
      "default": {
        "url": "${URL_1}",
        "tokenSecret": "CCR_ROUTINE_TOKEN"
      },
      "fleet": {
        "tokenSecret": "CCR_FLEET_ROUTINE_TOKEN",
        "url": "${URL_2}"
      }
    },
    "disabledTasks": []
  }
}
`;
  const after = `{
  "packs": ["acme-pack"],
  "taskScheduler": {
    "agenticTaskInvocationEndpoints": {
      "default": {
        "tokenSecret": "CCR_ROUTINE_TOKEN"
      },
      "fleet": {
        "tokenSecret": "CCR_FLEET_ROUTINE_TOKEN"
      }
    },
    "disabledTasks": []
  }
}
`;
  const tree = await run({ ...CAPABLE, [SETTINGS]: before });
  assert.equal(tree[SETTINGS], after);
  assert.deepEqual(JSON.parse(tree[SETTINGS]).taskScheduler.agenticTaskInvocationEndpoints, {
    default: { tokenSecret: 'CCR_ROUTINE_TOKEN' },
    fleet: { tokenSecret: 'CCR_FLEET_ROUTINE_TOKEN' },
  });
  assert.equal((await run({ ...CAPABLE, [SETTINGS]: after }))[SETTINGS], after, 'a second pass finds nothing to do');
});

// Removing the url before the member's mount reads the variable would leave its
// executor with no URL at all, and its engine rejecting the settings file.
test('a member whose mount still reads the url from settings keeps it', async () => {
  const text = `{ "taskScheduler": { "agenticTaskInvocationEndpoints": { "default": {\n  "url": "${URL_1}",\n  "tokenSecret": "T"\n} } } }\n`;
  for (const missing of Object.keys(CAPABLE)) {
    const mount = { ...CAPABLE };
    delete mount[missing];
    assert.equal((await run({ ...mount, [SETTINGS]: text }))[SETTINGS], text, `mount without ${missing}`);
  }
});
