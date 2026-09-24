import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

// The join runs over real paths, so every fixture spells the two files where the
// vocabulary and its producers actually live.
const RECORD = 'packs/claudinite-tasks/src/items/run-record.mjs'; // @real-entity the check scopes its two sets to this pack's own paths
const SCHEDULE = 'packs/claudinite-tasks/src/schedule/run.mjs'; // @real-entity as above
const EXECUTE = 'packs/claudinite-tasks/src/execute/loop.mjs'; // @real-entity as above

const vocabulary = (scheduler, executor) => [
  'export const RUN_PHASES = Object.freeze({',
  `  scheduler: Object.freeze([${scheduler.map((p) => `'${p}'`).join(', ')}]),`,
  `  executor: Object.freeze([${executor.map((p) => `'${p}'`).join(', ')}]),`,
  '});',
  '',
].join('\n');

ruleTester(declaredCheck('.claudinite/local/packs/claudinite', 'timed-phase-named-in-vocabulary'), {
  clean: {
    'a phase the vocabulary names is silent': { files: {
      [RECORD]: vocabulary(['list', 'ask'], ['pick']),
      [SCHEDULE]: "const endList = phase('list');\nconst endAsk = phase('ask');\n",
      [EXECUTE]: "const endPick = phase('pick');\n",
    } },
    'the second call shape — a word handed to the timing helper — resolves the same': { files: {
      [RECORD]: vocabulary(['list'], ['converge']),
      [SCHEDULE]: "const endList = phase('list');\n",
      [EXECUTE]: "return timed(cost, 'converge', async () => run());\n",
    } },
    'a word the vocabulary carries and nothing times is not a finding': { files: {
      [RECORD]: vocabulary(['list', 'drain'], ['pick']),
      [SCHEDULE]: "const endList = phase('list');\n",
      [EXECUTE]: "const endPick = phase('pick');\n",
    } },
    'a phase named only in a comment is not a producer': { files: {
      [RECORD]: vocabulary(['list'], ['pick']),
      [SCHEDULE]: "// the run used to call phase('repair') here\nconst endList = phase('list');\n",
      [EXECUTE]: "const endPick = phase('pick');\n",
    } },
    'a phase opened through a variable asserts nothing either way': { files: {
      [RECORD]: vocabulary(['list'], ['pick']),
      [SCHEDULE]: "const endList = phase('list');\n",
      [EXECUTE]: 'const end = cost ? cost.phase(name) : () => {};\n',
    } },
  },
  flagged: {
    // #2275 as the tree carried it: run.mjs timed `repair`, the scheduler's
    // vocabulary still named only list/ask/drain, and the measurement was dropped.
    'the scheduler times a phase the vocabulary lost': {
      files: {
        [RECORD]: vocabulary(['list', 'ask', 'drain'], ['pick']),
        [SCHEDULE]: "const endAsk = phase('ask');\nconst endRepair = phase('repair');\nconst endDrain = phase('drain');\n",
        [EXECUTE]: "const endPick = phase('pick');\n",
      },
      at: [
        { file: SCHEDULE, line: 2, what: /times a phase under 'repair', which RUN_PHASES does not name/ },
      ],
    },
    // The executor is the structurally identical sibling the simulator's guard
    // does not watch: its own test reads the PARSED record, which has already
    // dropped the word the vocabulary has no room for.
    'the executor times a phase the vocabulary lost': {
      files: {
        [RECORD]: vocabulary(['list'], ['pick', 'claim']),
        [SCHEDULE]: "const endList = phase('list');\n",
        [EXECUTE]: "const endPick = phase('pick');\nreturn timed(cost, 'converge', async () => run());\n",
      },
      at: [
        { file: EXECUTE, line: 2, what: /times a phase under 'converge', which RUN_PHASES does not name/ },
      ],
    },
    'a vocabulary whose shape moved reports itself rather than reading as empty': {
      files: {
        [RECORD]: "export const RUN_PHASES = { scheduler: ['list'] };\n",
        [SCHEDULE]: "const endList = phase('list');\n",
      },
      // The empty set reports itself, and the join it feeds still runs — so the
      // words it can no longer vouch for are named too, rather than reading clean.
      at: [
        { what: /RUN_PHASES names no phase word/ },
        { file: SCHEDULE, line: 1, what: /times a phase under 'list', which RUN_PHASES does not name/ },
      ],
    },
  },
});
