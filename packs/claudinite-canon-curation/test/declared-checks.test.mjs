import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

// The pack's declared checks, each proven on a violating fixture and a clean one.
const check = (id) => declaredCheck('packs/claudinite-canon-curation', id);

ruleTester(check('pack-directory-kebab-case'), {
  clean: {
    'kebab-case directories and the shelf files beside them': { files: { 'packs/my-pack/pack.mjs': 'export default {};\n', 'packs/README.md': 'shelf\n', 'packs/directory.GENERATED.md': 'x\n' } },
  },
  flagged: {
    'an underscore or a capital in a pack directory': {
      files: { 'packs/My_Pack/pack.mjs': 'export default {};\n' },
      at: [{ file: 'packs/My_Pack/pack.mjs', what: /not kebab-case/ }],
    },
  },
});

ruleTester(check('corpus-count-in-prose'), {
  clean: {
    'how to count, a version row, and a fenced example': {
      files: { 'packs/p/RULES.md': 'count them with the script.\n\n```\n3 rules\n```\n', 'packs/p/VERSIONS.md': '| 1 | now 12 rules |\n' },
    },
  },
  flagged: {
    'a quoted total in pack prose': { files: { 'packs/p/RULES.md': 'the corpus has 12 checks now.\n' }, at: [{ file: 'packs/p/RULES.md', line: 1, what: /"12 checks"/ }] },
  },
});

ruleTester(check('home-only-path-in-canon-prose'), {
  clean: {
    'a placeholder path, and a local pack naming its own home': {
      files: { 'packs/p/RULES.md': 'local packs live under .claudinite/local/packs/<pack>/\n', '.claudinite/local/packs/q/RULES.md': 'see .claudinite/local/packs/q/x.md\n' },
    },
  },
  flagged: {
    'canon prose naming a home-only pack path': { files: { 'packs/p/RULES.md': 'see .claudinite/local/packs/claudinite/x.md\n' }, at: [{ file: 'packs/p/RULES.md', line: 1, what: /home-only local pack path/ }] },
  },
});

ruleTester(check('named-import-of-new-engine-export'), {
  clean: {
    'a namespace import behind a typeof guard': {
      base: { 'engine/h.mjs': 'export function old() {}\n', 'packs/p/pack.mjs': "import { old } from '../../engine/h.mjs';\n" },
      files: { 'engine/h.mjs': 'export function old() {}\nexport function fresh() {}\n', 'packs/p/pack.mjs': "import * as h from '../../engine/h.mjs';\nif (typeof h.fresh === 'function') h.fresh();\n" },
    },
    'no export added': {
      base: { 'engine/h.mjs': 'export function old() {}\n', 'packs/p/pack.mjs': "import { old } from '../../engine/h.mjs';\n" },
      files: { 'packs/p/pack.mjs': "import { old } from '../../engine/h.mjs';\nold();\n" },
    },
  },
  flagged: {
    'a named import of the export the same change adds': {
      base: { 'engine/h.mjs': 'export function old() {}\n', 'packs/p/pack.mjs': "import { old } from '../../engine/h.mjs';\n" },
      files: { 'engine/h.mjs': 'export function old() {}\nexport function fresh() {}\n', 'packs/p/pack.mjs': "import { old, fresh } from '../../engine/h.mjs';\n" },
      at: [{ file: 'packs/p/pack.mjs', what: /imports the engine export fresh by name/ }],
    },
  },
});
