import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

ruleTester(declaredCheck('.claudinite/local/packs/claudinite', 'updates-export-removed'), {
  clean: {
    'a reworded export and an emptied one remain exports': {
      base: { 'updates/x.mjs': "export function a() { return 1; }\nexport * from './y.mjs';\n" },
      files: { 'updates/x.mjs': "export function a(z) { return z; }\nexport * from './y.mjs';\nexport function gone() { /* emptied: fielded workers still call it */ }\n" },
    },
  },
  flagged: {
    'an export the change removes from a flow module': {
      base: { 'updates/x.mjs': "export function a() {}\nexport * from './y.mjs';\n" },
      files: { 'updates/x.mjs': "export * from './y.mjs';\n" },
      at: [{ file: 'updates/x.mjs', line: 1, what: /removes an export from a fielded flow module: export function a/ }],
    },
  },
});
