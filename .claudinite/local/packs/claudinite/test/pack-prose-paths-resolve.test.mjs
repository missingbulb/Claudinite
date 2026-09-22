import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

// A path cited in pack prose is where the rule sends the next session. Only
// `packs/` and `engine/` are this tree's own: a canon pack's prose also names
// paths in the repo that adopts it, and those resolve nowhere here.
ruleTester(declaredCheck('.claudinite/local/packs/claudinite', 'pack-prose-paths-resolve'), {
  clean: {
    'a citation whose target is in the tree is silent': { files: {
      'packs/p/RULES.md': '- **Landing it** - through `packs/p/deliver.mjs`. (landing-it)\n',
      'packs/p/deliver.mjs': 'export const x = 1;\n',
    } },
    'a path outside packs/ and engine/ names the adopting repo, not this one': { files: {
      'packs/p/skills/s/SKILL.md': '- Write the artifacts to `dev/build/release/PRIVACY.md`.\n',
    } },
    'a citation inside a fenced example is not a pointer': { files: {
      'packs/p/RULES.md': '- **Running it** (running-it)\n\n```\n`packs/p/gone.mjs`\n```\n',
    } },
    'a pack file that is not session prose is out of scope': { files: {
      'packs/p/README.md': 'The worker is `packs/p/gone.mjs`.\n',
      'packs/p/provenance/landing-it.md': '- **Reason:** it was `packs/p/gone.mjs` before the move.\n',
    } },
  },
  flagged: {
    'a canon rule and a local rule left behind by a move': {
      files: {
        'packs/p/skills/s/SKILL.md': 'Load it from `packs/p/old-name.mjs` first.\n',
        '.claudinite/local/packs/q/RULES.md':
          '- **Regenerating** - land it through `packs/acme-pack/deliver-generated.mjs`. (regenerating)\n',
      },
      at: [
        { file: '.claudinite/local/packs/q/RULES.md', line: 1, what: /cites packs\/acme-pack\/deliver-generated\.mjs, which is not a path/ },
        { file: 'packs/p/skills/s/SKILL.md', line: 1, what: /cites packs\/p\/old-name\.mjs, which is not a path/ },
      ],
    },
  },
});
