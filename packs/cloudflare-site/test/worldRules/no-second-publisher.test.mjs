import { ruleTester } from '../../../../engine-tests/helpers.mjs';
import noSecondPublisher from '../../worldRules/no-second-publisher.mjs';

const base = { 'wrangler.json': '{ "assets": { "directory": "./site" } }\n', 'site/index.html': '<p>x</p>\n' };

const workflow = (step) => `name: x\non: push\njobs:\n  a:\n    steps:\n      ${step}\n`;

ruleTester(noSecondPublisher, {
  clean: {
    'a workflow that builds and tests but publishes nothing': {
      files: { ...base, '.github/workflows/ci.yml': workflow('- run: node --test') },
    },
    'a commented-out publish step': {
      files: { ...base, '.github/workflows/ci.yml': workflow('# - uses: actions/deploy-pages@v4') },
    },
  },
  flagged: {
    'a Pages deploy still wired up': {
      files: { ...base, '.github/workflows/pages.yml': workflow('- uses: actions/deploy-pages@v4') },
      at: [{ file: '.github/workflows/pages.yml', line: 6, what: /publishes the site from a workflow/ }],
    },
    'a second wrangler deploy in CI': {
      files: { ...base, '.github/workflows/ci.yml': workflow('- run: npx wrangler@4.128.0 deploy') },
      at: [{ file: '.github/workflows/ci.yml', line: 6 }],
    },
    'a CNAME file still claiming the domain for the old host': {
      files: { ...base, 'site/CNAME': 'example.com\n' },
      at: [{ file: 'site/CNAME', what: /claims the domain for GitHub Pages/ }],
    },
  },
});
