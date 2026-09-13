import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimedHostnames, parseWranglerConfig, publishedDir, stripJsonComments, wranglerConfigPath } from '../lib.mjs';

test('the config is found at the root and one directory down, never deeper', () => {
  assert.equal(wranglerConfigPath(['wrangler.json', 'site/index.html']), 'wrangler.json');
  assert.equal(wranglerConfigPath(['web/wrangler.jsonc']), 'web/wrangler.jsonc');
  assert.equal(wranglerConfigPath(['test/fixtures/demo/wrangler.json']), null);
});

// wrangler prefers .json over .jsonc, and a shallower config over a deeper one; a repo
// carrying both must be read the way wrangler itself reads it, or the release ships a
// tree nobody declared.
test("the config is picked in wrangler's own precedence order", () => {
  assert.equal(wranglerConfigPath(['wrangler.jsonc', 'wrangler.json']), 'wrangler.json');
  assert.equal(wranglerConfigPath(['web/wrangler.json', 'wrangler.jsonc']), 'wrangler.jsonc');
});

test('a JSONC config parses, comments and all', () => {
  const config = parseWranglerConfig(`{
    // the published tree
    "assets": { "directory": "./site" }, /* and nothing else */
    "name": "a // not-a-comment name"
  }`);
  assert.equal(config.assets.directory, './site');
  assert.equal(config.name, 'a // not-a-comment name');
});

test('an unparseable or absent config is null rather than a throw', () => {
  assert.equal(parseWranglerConfig('{ nope'), null);
  assert.equal(parseWranglerConfig(null), null);
});

test('a string ending in a backslash-escaped quote does not swallow the rest of the file', () => {
  assert.equal(stripJsonComments('{"a":"b\\"//c"}'), '{"a":"b\\"//c"}');
});

test('the published tree resolves against the directory holding the config', () => {
  assert.equal(publishedDir({ assets: { directory: './site' } }, 'wrangler.json'), 'site');
  assert.equal(publishedDir({ assets: { directory: 'public/' } }, 'web/wrangler.json'), 'web/public');
  assert.equal(publishedDir({}, 'wrangler.json'), null);
});

test('only the custom-domain routes are claimed hostnames', () => {
  const config = {
    routes: [
      { pattern: 'example.com', custom_domain: true },
      { pattern: 'www.example.com', custom_domain: true },
      { pattern: 'example.com/api/*', zone_name: 'example.com' },
    ],
  };
  assert.deepEqual(claimedHostnames(config), ['example.com', 'www.example.com']);
  assert.deepEqual(claimedHostnames({}), []);
});
