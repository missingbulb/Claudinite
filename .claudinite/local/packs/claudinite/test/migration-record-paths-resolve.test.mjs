import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

// A migration record's canon paths are gates that fail open: a probe that cannot
// read its target concludes "not capable", and a materialization whose template is
// missing is skipped. The tree must still carry every path a record names.
ruleTester(declaredCheck('.claudinite/local/packs/claudinite', 'migration-record-paths-resolve'), {
  clean: {
    'a probe and a template that resolve are silent': { files: {
      'packs/p/migrations/2026-01-01-x/migration.mjs':
        "const CALENDAR = 'packs/p/calendar.mjs';\nexport default { materialize: [{ template: 'packs/p/stubs/w.yml', dest: '.github/workflows/w.yml' }] };\n",
      'packs/p/calendar.mjs': 'export const x = 1;\n',
      'packs/p/stubs/w.yml': 'on: push\n',
    } },
    'a commented-out declaration is not a path the record reads': { files: {
      'engine/migrations/2026-01-01-y/migration.mjs':
        "// before the move this read `const MAP = 'engine/pack_loader/gone.mjs';`\nexport default { id: 'y' };\n",
    } },
    'a path outside packs/ and engine/ names the member tree, not this one': { files: {
      'packs/p/migrations/2026-01-01-z/migration.mjs':
        "export default { legacyPresent: async (exists) => exists('.github/workflows/gone.yml') };\n",
    } },
    'a module beside the records is not a record': { files: {
      'packs/p/migrations/helpers.mjs': "export const CALENDAR = 'packs/p/calendar.mjs';\n",
    } },
  },
  flagged: {
    'a probe target and a template a move left behind': {
      files: {
        'packs/p/migrations/2026-01-01-x/migration.mjs':
          "const CALENDAR = 'packs/p/calendar.mjs';\nexport default { id: 'x' };\n",
        'engine/migrations/2026-01-02-y/migration.mjs':
          "export default { materialize: [{ template: 'packs/old-name/stubs/w.yml', dest: '.github/workflows/w.yml' }] };\n",
      },
      at: [
        { file: 'engine/migrations/2026-01-02-y/migration.mjs', line: 1, what: /names packs\/old-name\/stubs\/w\.yml, which is not a path/ },
        { file: 'packs/p/migrations/2026-01-01-x/migration.mjs', line: 1, what: /names packs\/p\/calendar\.mjs, which is not a path/ },
      ],
    },
  },
});
