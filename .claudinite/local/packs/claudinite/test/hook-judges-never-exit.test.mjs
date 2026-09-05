import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

const rule = declaredCheck('.claudinite/local/packs/claudinite', 'hook-judges-never-exit');

ruleTester(rule, {
  clean: {
    'a judge that returns its verdict': { files: { 'engine/hooks/x-judge.mjs': "export const judge = async () => ({ context: 'a note' });\n" } },
    'a comment naming the process is not a call': { files: { 'engine/hooks/x-judge.mjs': "// never process.exit here\nexport const judge = () => null;\n" } },
    'the runner and the entries are out of scope': { files: {
      'engine/hooks/hook-runner.mjs': 'process.exit(0);\n',
      'engine/hooks/x-command.mjs': 'process.exit(0);\n',
      'engine/checks/x-judge.mjs': 'process.exit(0);\n',
    } },
  },
  flagged: {
    'a judge that exits or writes': {
      files: { 'engine/hooks/x-judge.mjs': "export const judge = () => { process.stderr.write('no'); process.exit(2); };\n" },
      at: [{ file: 'engine/hooks/x-judge.mjs', line: 1, what: /process\.stderr/ }],
    },
  },
});

test('the scope names real judges in this tree', () => {
  const tracked = execFileSync('git', ['ls-files', 'engine/hooks'], { encoding: 'utf8' }).split('\n');
  const judges = tracked.filter((p) => rule.spec.scanMatchers.some((m) => m.test(p)));
  assert.ok(judges.length >= 3, `expected the per-call judges, matched ${JSON.stringify(judges)}`);
});
