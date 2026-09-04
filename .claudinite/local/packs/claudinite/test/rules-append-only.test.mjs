import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

ruleTester(declaredCheck('.claudinite/local/packs/claudinite', 'rules-append-only'), {
  clean: {
    'adding a rule and rewording a clause remove no rule line': {
      base: { 'packs/p/RULES.md': '- **Keep** — the old way.\n' },
      files: { 'packs/p/RULES.md': '- **Keep** — the settled way.\n- **New** — added.\n' },
    },
  },
  flagged: {
    'a rule line that the change removes is named': {
      base: { 'packs/p/RULES.md': '- **Keep** — x\n- **Gone** — y\n' },
      files: { 'packs/p/RULES.md': '- **Keep** — x\n' },
      at: [{ file: 'packs/p/RULES.md', line: 2, what: /removes the rule "Gone"/ }],
    },
  },
});
