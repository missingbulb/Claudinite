// Put the repository-variable bag into every member's live executor workflow (#1509).
//
// A stub is scaffolded once at adoption, so a member that adopted before #1494 holds the
// bag's reader and no `CLAUDINITE_VARS` line for it to read: safe, but inert.
//
// A REWRITE, NOT A MATERIALIZE. The executor is not identical across members: the wiring
// converge stamps each one's own `required_secrets` beneath the `# claudinite:secrets`
// marker. Copying the stub over it would deliver the line and take every member's
// secrets with it. A rewrite preserves everything it does not name.
//
// IDEMPOTENCY LIVES IN `appliesTo`, not in the replacement: rewriting an already-rewritten
// file would insert a SECOND copy of the block.
//
// THE ANCHOR is the operator hold, which every member's executor carries. Anchoring to the
// `# claudinite:secrets` marker instead
// would put the bag inside the converge's stamped region, where the next wiring
// converge would regenerate over it.
const EXECUTOR = '.github/workflows/claudinite-executor.yml';
const HOLD = '          CLAUDINITE_TASKS_SUSPEND_ALL: ${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}\n';
const BAG = `          # Every repository VARIABLE, as one static line (#1492). Unlike the secrets
          # below this never changes: \`vars\` is the context GitHub's own docs define as
          # non-sensitive and render unmasked in logs, so serialising it is not the
          # exfiltration shape that gets a workflow held for approval (#1336) — and this
          # file is the one path a converge cannot write, so keeping it independent of
          # what any task declares is worth a great deal. vars-bag.mjs is the reader.
          CLAUDINITE_VARS: \${{ toJSON(vars) }}
`;

export default {
  id: 'executor-vars-bag',
  landed: '2026-08-31',
  version: '60831.6',
  summary: 'the live executor workflow carries CLAUDINITE_VARS, so a task can read a repo variable the workflow never names (#1492, #1494)',

  appliesTo: async (read) => {
    const text = await read(EXECUTOR);
    if (!text) return false;
    return text.includes(HOLD) && !text.includes('CLAUDINITE_VARS:');
  },

  rewrite: [{ file: EXECUTOR, replace: [{ from: HOLD, to: HOLD + BAG }] }],

  legacyPresent: async (_exists, read) => {
    const text = await read(EXECUTOR);
    return Boolean(text) && text.includes(HOLD) && !text.includes('CLAUDINITE_VARS:');
  },
};
