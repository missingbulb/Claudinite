import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

// The home pack's declared world checks, each on a violating fixture and a clean one.
const check = (id) => declaredCheck('.claudinite/local/packs/claudinite', id);

ruleTester(check('migration-record-in-docs'), {
  clean: { 'a design with its plan in the issue': { files: { 'docs/x/DESIGN.md': '# d\n', 'notes/MIGRATION-notes.md': 'x\n' } } },
  flagged: { 'a MIGRATION.md beside a design': { files: { 'docs/x/DESIGN.md': '# d\n', 'docs/x/MIGRATION.md': '# plan\n' }, at: [{ file: 'docs/x/MIGRATION.md', what: /MIGRATION\.md beside a design/ }] } },
});

ruleTester(check('author-association-as-permission'), {
  clean: {
    'a comment naming the field, and a test file': {
      files: { 'packs/p/x.mjs': "// never author_association\nconst ok = perm === 'admin';\n", 'packs/p/test/x.test.mjs': "assert.equal(payload.author_association, 'OWNER');\n" },
    },
  },
  flagged: { 'code deciding on the field': { files: { 'packs/p/x.mjs': "const ok = payload.author_association === 'OWNER';\n" }, at: [{ file: 'packs/p/x.mjs', line: 1, what: /reads author_association/ }] } },
});

ruleTester(check('year-last-digit-rollover'), {
  clean: { 'an epoch subtraction': { files: { 'engine/v.mjs': 'const y = year - 2020;\nconst m = month % 12;\n' } } },
  flagged: { 'a year taken modulo ten': { files: { 'engine/v.mjs': 'const y = fullYear % 10;\n' }, at: [{ file: 'engine/v.mjs', line: 1, what: /anchors a year on its last digit/ }] } },
});
