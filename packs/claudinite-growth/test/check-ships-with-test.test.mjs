import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

// A check lands with the fixture that proves it: a new declared entry or a new
// rule module in the branch needs a test file changed in the same branch.
ruleTester(declaredCheck('packs/claudinite-growth', 'check-ships-with-test'), {
  clean: {
    'a new declaration beside a test change': {
      base: { 'packs/p/declared-checks.json': '[]\n', 'packs/p/test/pack.test.mjs': 't\n' },
      files: { 'packs/p/declared-checks.json': '[{\n  "id": "a",\n  "severity": "advisory",\n  "failureMessage": "m"\n}]\n', 'packs/p/test/pack.test.mjs': 't2\n' },
    },
    'a message reworded in an existing declaration needs no fixture': {
      base: { 'packs/p/declared-checks.json': '[{\n  "id": "a",\n  "severity": "advisory",\n  "failureMessage": "m"\n}]\n' },
      files: { 'packs/p/declared-checks.json': '[{\n  "id": "a",\n  "severity": "advisory",\n  "failureMessage": "clearer"\n}]\n' },
    },
  },
  flagged: {
    'a new declaration and a new rule module, each without a test change': {
      base: { 'packs/p/declared-checks.json': '[]\n' },
      files: {
        'packs/p/declared-checks.json': '[{\n  "id": "a",\n  "severity": "advisory",\n  "failureMessage": "m"\n}]\n',
        'packs/p/worldRules/b.mjs': "const rule = {\n  id: 'b',\n  severity: 'advisory',\n};\nexport default rule;\n",
      },
      at: [
        { file: 'packs/p/declared-checks.json', what: /declares a new check, and no test file changed/ },
        { file: 'packs/p/worldRules/b.mjs', what: /adds a rule, and no test file changed/ },
      ],
    },
  },
});
