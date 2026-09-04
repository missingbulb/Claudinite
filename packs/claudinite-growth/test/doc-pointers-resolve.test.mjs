import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

// A rule module's `doc:` pointer is the More line its findings print; the tree
// must carry the path it names.
ruleTester(declaredCheck('packs/claudinite-growth', 'doc-pointers-resolve'), {
  clean: {
    'a pointer at a tracked file is silent': { files: {
      'packs/p/worldRules/a.mjs': "export default { id: 'a', doc: 'packs/p/README.md', run() { return []; } };\n",
      'packs/p/README.md': 'depth\n',
    } },
    'a commented-out pointer is not a pointer': { files: {
      'packs/p/workRules/a.mjs': "// doc: 'packs/p/gone.md'\nexport default { id: 'a', run() { return []; } };\n",
    } },
    'a fragment after the path is not part of it': { files: {
      'packs/p/skills/s/checks.mjs': "export default [{ id: 'a', doc: 'packs/p/README.md#section', run() { return []; } }];\n",
      'packs/p/README.md': 'depth\n',
    } },
  },
  flagged: {
    'a pointer at nothing flags at its line, in a canon pack and a local one alike': {
      files: {
        'packs/p/worldRules/a.mjs': "export default {\n  id: 'a',\n  doc: 'skills/p/SKILL.md',\n};\n",
        '.claudinite/local/packs/q/workRules/b.mjs': "export default { id: 'b', doc: 'docs/q.md' };\n",
      },
      at: [
        { file: '.claudinite/local/packs/q/workRules/b.mjs', line: 1, what: /doc: names docs\/q\.md, which is not a path/ },
        { file: 'packs/p/worldRules/a.mjs', line: 3, what: /doc: names skills\/p\/SKILL\.md/ },
      ],
    },
  },
});
