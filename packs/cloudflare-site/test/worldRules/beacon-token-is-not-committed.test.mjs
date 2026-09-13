import { ruleTester } from '../../../../engine-tests/helpers.mjs';
import beaconTokenIsNotCommitted from '../../worldRules/beacon-token-is-not-committed.mjs';
import { BEACON_PLACEHOLDER } from '../../lib.mjs';

const base = { 'wrangler.json': '{ "assets": { "directory": "./site" } }\n' };
const TOKEN = '4f8b21ce9a7d4e0fb3c65a1d2e7f9081';

ruleTester(beaconTokenIsNotCommitted, {
  clean: {
    'the loader as it is committed, carrying the placeholder': {
      files: { ...base, 'site/analytics.js': `{"token": "${BEACON_PLACEHOLDER}"}\n` },
    },
    'a token in a commented-out loader, which beacons nothing': {
      files: { ...base, 'site/analytics.js': `// var beacon = {"token": "${TOKEN}"};\n` },
    },
    'a token outside the published tree': {
      files: { ...base, 'site/index.html': '<p>x</p>\n', 'docs/notes.md': `{"token": "${TOKEN}"}\n` },
    },
  },
  flagged: {
    'a real token committed into the published loader': {
      files: { ...base, 'site/analytics.js': `var x = 1;\nvar beacon = {"token": "${TOKEN}"};\n` },
      at: [{ file: 'site/analytics.js', line: 2, what: /beacon token is committed/, fix: new RegExp(BEACON_PLACEHOLDER) }],
    },
    'the same token in a page\'s data-cf-beacon attribute': {
      files: { ...base, 'site/index.html': `<script defer data-cf-beacon='{"token": "${TOKEN}"}'></script>\n` },
      at: [{ file: 'site/index.html', line: 1 }],
    },
  },
});
