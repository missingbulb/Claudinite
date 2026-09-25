import { ruleTester } from '../../../../engine-tests/helpers.mjs';
import publishesASiteDirectory from '../../worldRules/publishes-a-site-directory.mjs';

const config = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const sound = { assets: { directory: './site' }, compatibility_date: '2026-09-08' };

ruleTester(publishesASiteDirectory, {
  clean: {
    'a config naming a tree that exists, with a pinned runtime': {
      files: { 'wrangler.json': config(sound), 'site/index.html': '<p>x</p>' },
    },
    'the same one directory down': {
      files: { 'web/wrangler.json': config(sound), 'web/site/index.html': '<p>x</p>' },
    },
  },
  flagged: {
    'a repo with no wrangler config at all': {
      files: { 'site/index.html': '<p>x</p>' },
      at: [{ on_fail: 'block', what: /no wrangler\.json or wrangler\.jsonc/, fix: /TOML config/ }],
    },
    'a config that does not parse': {
      files: { 'wrangler.json': '{ "assets": ', 'site/index.html': '<p>x</p>' },
      at: [{ file: 'wrangler.json', what: /does not parse as JSON/ }],
    },
    'a config declaring no published tree': {
      files: { 'wrangler.json': config({ compatibility_date: '2026-09-08' }) },
      at: [{ file: 'wrangler.json', what: /declares no assets\.directory/ }],
    },
    'a published tree widened to the repo root': {
      files: { 'wrangler.json': config({ ...sound, assets: { directory: '.' } }), 'site/index.html': '<p>x</p>' },
      at: [{ file: 'wrangler.json', what: /publishes the repo root/, fix: /vendored mount/ }],
    },
    'a published tree holding nothing': {
      files: { 'wrangler.json': config(sound), 'README.md': 'x' },
      at: [{ file: 'wrangler.json', what: /names site, which holds no tracked file/ }],
    },
    'an unpinned runtime': {
      files: { 'wrangler.json': config({ assets: { directory: './site' } }), 'site/index.html': '<p>x</p>' },
      at: [{ file: 'wrangler.json', what: /declares no compatibility_date/ }],
    },
  },
});
