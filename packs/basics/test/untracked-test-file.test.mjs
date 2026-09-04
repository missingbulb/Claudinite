import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

ruleTester(declaredCheck('packs/basics', 'untracked-test-file'), {
  clean: {
    'tracked tests and an untracked non-test are silent': { files: { 'a.test.mjs': 't\n' }, uncommitted: { 'scratch.md': 'n\n' } },
  },
  flagged: {
    'an untracked test file in any of the common spellings': {
      uncommitted: { 'b.test.mjs': 't\n', 'src/c.spec.ts': 't\n', 'tests/test_d.py': 't\n', 'e_test.go': 't\n' },
      at: [
        { file: 'b.test.mjs', what: /is untracked/ },
        { file: 'e_test.go', what: /is untracked/ },
        { file: 'src/c.spec.ts', what: /is untracked/ },
        { file: 'tests/test_d.py', what: /is untracked/ },
      ],
    },
  },
});
