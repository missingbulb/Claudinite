import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { removeTree } from '../../../../../engine/remove-tree.mjs';
import {
  SOURCE, DEFAULT_WORKER_NAME, COMPATIBILITY_DATE, NeedsAction,
  resolveOrigins, uploadForm, probe, deploy, wiringNote,
} from '../../../tasks/deploy-oauth-exchange/deploy.mjs';
import declaration from '../../../tasks/deploy-oauth-exchange/task.mjs';

const member = (config) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-deploy-'));
  writeFileSync(join(root, '.claudinite-settings.json'),
    JSON.stringify({ packs: [{ id: 'claudinite-dashboard', config }] }, null, 2));
  return root;
};

const ENV = {
  CLOUDFLARE_API_TOKEN: 'cf-token',
  CLOUDFLARE_ACCOUNT_ID: 'acct',
  GITHUB_OAUTH_CLIENT_SECRET: 'shh',
  CLAUDINITE_REPO: 'missingbulb/Shepherd',
};

test('the endpoint source the deploy uploads is the pack\'s own, and is the real handler', async () => {
  const src = await readFile(SOURCE, 'utf8');
  assert.match(src, /export default \{/);
  assert.match(src, /login\/oauth\/access_token/);
});

test('resolveOrigins prefers the stated list, then redirectUri, then the owner\'s Pages host', () => {
  assert.deepEqual(resolveOrigins({ allowedOrigins: ['https://dash.example.com/x'] }, 'o/r'), ['https://dash.example.com']);
  assert.deepEqual(resolveOrigins({ allowedOrigins: 'https://a.example, https://b.example' }, 'o/r'),
    ['https://a.example', 'https://b.example']);
  assert.deepEqual(resolveOrigins({ redirectUri: 'https://missingbulb.github.io/Sheepdog/' }, 'o/r'),
    ['https://missingbulb.github.io']);
  assert.deepEqual(resolveOrigins({}, 'MissingBulb/Shepherd'), ['https://missingbulb.github.io']);
  assert.deepEqual(resolveOrigins({}, ''), []);
});

test('the upload carries the module, its name as main_module, and the three bindings — the secret as secret_text', async () => {
  const form = uploadForm('export default {};', {
    clientId: 'Iv1.abc', clientSecret: 'shh', origins: ['https://a.example', 'https://b.example'],
  });
  const metadata = JSON.parse(form.get('metadata'));
  assert.equal(metadata.main_module, 'oauth-exchange.mjs');
  assert.equal(metadata.compatibility_date, COMPATIBILITY_DATE);
  assert.ok(form.get('oauth-exchange.mjs'), 'the module part is named as main_module names it');
  const byName = Object.fromEntries(metadata.bindings.map((b) => [b.name, b]));
  assert.equal(byName.GITHUB_CLIENT_SECRET.type, 'secret_text');
  assert.equal(byName.GITHUB_CLIENT_ID.type, 'plain_text');
  assert.equal(byName.ALLOWED_ORIGINS.text, 'https://a.example,https://b.example');
});

test('the probe accepts only the two answers this endpoint gives, and retries while a route propagates', async () => {
  const answers = [];
  const fetchImpl = async (_url, opts) => {
    const origin = opts.headers.Origin;
    const reply = answers.shift();
    if (reply === 'down') return { status: 404, json: async () => ({}) };
    return origin === 'https://ok.example'
      ? { status: 400, json: async () => ({ error: 'missing_code' }) }
      : { status: 403, json: async () => ({ error: 'origin_not_allowed' }) };
  };
  answers.push('down');
  const v = await probe('https://w.example', 'https://ok.example', { fetchImpl, waitMs: 0, attempts: 3 });
  assert.deepEqual(v, { ok: true, attempts: 2 });

  // A URL that answers 200 to a stranger is NOT this endpoint, however alive it is.
  const permissive = async () => ({ status: 200, json: async () => ({ access_token: 'x' }) });
  const bad = await probe('https://w.example', 'https://ok.example', { fetchImpl: permissive, waitMs: 0, attempts: 2 });
  assert.equal(bad.ok, false);
  assert.match(bad.why, /origin_not_allowed/);
});

// The account id is in every Cloudflare dashboard URL its owner opens, so declaring it
// a secret would both misstate it and put it in a store it does not need. Since #1494
// the executor hands every repository variable to code-work with nothing declared, so
// the only thing that must be true is that this task does not ask for it as a secret.
test('only the two real credentials are declared secrets — the account id is a repository variable', () => {
  assert.deepEqual(declaration.required_secrets, ['CLOUDFLARE_API_TOKEN', 'GITHUB_OAUTH_CLIENT_SECRET']);
});

test('a missing clientId, an unresolvable origin and a missing secret are each a NeedsAction naming what to set', async () => {
  const noId = member({});
  await assert.rejects(deploy({ repoRoot: noId, env: ENV }), (e) => e instanceof NeedsAction && /clientId/.test(e.message));

  const noOrigin = member({ clientId: 'Iv1.abc' });
  await assert.rejects(deploy({ repoRoot: noOrigin, env: { ...ENV, CLAUDINITE_REPO: '' } }),
    (e) => e instanceof NeedsAction && /allowedOrigins/.test(e.message));

  const ok = member({ clientId: 'Iv1.abc' });
  await assert.rejects(deploy({ repoRoot: ok, env: { ...ENV, CLOUDFLARE_API_TOKEN: '' } }),
    (e) => e instanceof NeedsAction && /repo Actions secret.*CLOUDFLARE_API_TOKEN/s.test(e.message));

  // Nothing declares the account id, so the queue cannot park on it — naming it, and
  // naming it as a VARIABLE rather than a secret, is this code's own job.
  const noAccount = member({ clientId: 'Iv1.abc' });
  await assert.rejects(deploy({ repoRoot: noAccount, env: { ...ENV, CLOUDFLARE_ACCOUNT_ID: '' } }),
    (e) => e instanceof NeedsAction && /repository variable CLOUDFLARE_ACCOUNT_ID/.test(e.message));
  for (const r of [noId, noOrigin, ok, noAccount]) removeTree(r);
});

test('a dry run resolves everything and uploads nothing', async () => {
  const root = member({ clientId: 'Iv1.abc' });
  const out = await deploy({ repoRoot: root, env: ENV, dryRun: true, log: () => {} });
  assert.deepEqual(out, { dryRun: true, name: DEFAULT_WORKER_NAME, origins: ['https://missingbulb.github.io'], clientId: 'Iv1.abc' });
  removeTree(root);
});

test('the wiring note names the value to set, and says so is already set when it is', () => {
  assert.match(wiringNote({ url: 'https://w.example', exchangeUrl: null }), /NOT YET WIRED.*https:\/\/w\.example/s);
  assert.match(wiringNote({ url: 'https://w.example', exchangeUrl: 'https://old.example' }), /currently names https:\/\/old\.example/);
  assert.match(wiringNote({ url: 'https://w.example', exchangeUrl: 'https://w.example' }), /already names/);
});
