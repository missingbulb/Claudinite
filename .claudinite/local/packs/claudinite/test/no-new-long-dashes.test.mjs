import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

// The owner's standing preference: a change adds no em or en dash, spelled as the
// character or as the JSON escape a re-serialisation leaves behind; an ordinary hyphen
// is fine, and the dashes the tree already carries are not the change's.
ruleTester(declaredCheck('.claudinite/local/packs/claudinite', 'no-new-long-dashes'), {
  clean: {
    'a hyphen, and a long dash the base already held': {
      base: { 'docs/a.md': 'first — kept\n' },
      files: { 'docs/a.md': 'first — kept\na well-formed hyphen, and a range 1-3\n' },
    },
    'a long dash in the vendored mount': {
      base: {},
      files: { '.claudinite/shared/packs/p/RULES.md': 'vendored — not this change\'s\n' },
    },
  },
  flagged: {
    'an added em dash': {
      base: { 'docs/a.md': 'first\n' },
      files: { 'docs/a.md': 'first\nsecond — added\n' },
      at: [{ file: 'docs/a.md', line: 2, what: /adds a long dash/ }],
    },
    'an added en dash': {
      base: {},
      files: { 'packs/p/README.md': 'pages 3–5\n' },
      at: [{ file: 'packs/p/README.md', line: 1, what: /adds a long dash/ }],
    },
    'the JSON escape of one, as a re-serialisation writes it': {
      base: { 'packs/p/declared-checks.json': '{ "fix": "take it — from the bag" }\n' },
      files: { 'packs/p/declared-checks.json': '{ "fix": "take it \\u2014 from the bag" }\n' },
      at: [{ file: 'packs/p/declared-checks.json', line: 1, what: /adds a long dash/ }],
    },
  },
});
