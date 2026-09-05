import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../../../../../engine/remove-tree.mjs';
import {
  SOURCE, DEFAULT_WORKER_NAME, COMPATIBILITY_DATE, NeedsAction,
  resolveOrigins, uploadForm, probe, deploy, wiringNote,
} from '../../../tasks/deploy-oauth-exchange/deploy.mjs';

const member = (config) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-deploy-'));
  writeFileSync(join(root, '.claudinite-settings.json'),
    JSON.stringify({ packs: [{ id: 'claudinite-dashboard', config }] }, null, 2));
  return root;
};

const ENV = {
  CLOUDFLARE_API_TOKEN: 'cf-token',
  CLOUDFLARE_ACCOUNT_ID: 'acct',
  DASHBOARD_OAUTH_CLIENT_SECRET: 'shh',
  CLAUDINITE_REPO: 'missingbulb/Shepherd',
};

// The file the deploy uploads is driven here as the Worker runtime would drive it:
// one allowed origin's code becomes one token, and a stranger's origin gets nothing.
test('the endpoint source the deploy uploads exchanges a code with GitHub, for allowed origins only', async (t) => {
  const { default: handler } = await import(SOURCE);
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  const posted = [];
  globalThis.fetch = async (url, init) => {
    posted.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ access_token: 'gho_x', token_type: 'bearer', refresh_token: 'never-forwarded' }) };
  };
  const env = { GITHUB_CLIENT_ID: 'Iv1.abc', GITHUB_CLIENT_SECRET: 'shh', ALLOWED_ORIGINS: 'https://ok.example' };
  const post = (origin) => new Request('https://w.example/', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ code: 'abc' }) });

  const ok = await handler.fetch(post('https://ok.example'), env);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { access_token: 'gho_x', token_type: 'bearer' }, 'only the token travels back');
  assert.match(posted[0].url, /github\.com\/login\/oauth\/access_token$/);
  assert.equal(posted[0].body.client_secret, 'shh', 'the secret is spent server-side, where the page cannot');

  const stranger = await handler.fetch(post('https://evil.example'), env);
  assert.equal(stranger.status, 403);
  assert.equal(posted.length, 1, 'a refused origin never reaches GitHub');
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

test('a missing clientId, an unresolvable origin and a missing secret are each a NeedsAction naming what to set', async () => {
  const noId = member({});
  await assert.rejects(deploy({ repoRoot: noId, env: ENV }),
    (e) => e instanceof NeedsAction && /CLAUDINITE_DASHBOARD_CLIENT_ID/.test(e.message));

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

// One reader for the deploy and the site build, so the endpoint cannot be minted for a
// different App than the button authorizes against.
test('the deploy takes its client id from the same repository variable the page does', async () => {
  const root = member({});
  const out = await deploy({
    repoRoot: root,
    env: { ...ENV, CLAUDINITE_DASHBOARD_CLIENT_ID: 'Iv1.fromVar' },
    dryRun: true,
    log: () => {},
  });
  assert.equal(out.clientId, 'Iv1.fromVar');
  removeTree(root);
});

test('a dry run resolves everything and uploads nothing', async () => {
  const root = member({ clientId: 'Iv1.abc' });
  const out = await deploy({ repoRoot: root, env: ENV, dryRun: true, log: () => {} });
  assert.deepEqual(out, { dryRun: true, name: DEFAULT_WORKER_NAME, origins: ['https://missingbulb.github.io'], clientId: 'Iv1.abc' });
  removeTree(root);
});

test('the wiring note names the variable to set, and says so is already set when it is', () => {
  const unset = wiringNote({ url: 'https://w.example', exchangeUrl: null });
  assert.match(unset, /NOT YET WIRED.*CLAUDINITE_DASHBOARD_EXCHANGE_URL.*https:\/\/w\.example/s);
  assert.match(wiringNote({ url: 'https://w.example', exchangeUrl: 'https://old.example' }), /currently resolves to https:\/\/old\.example/);
  assert.match(wiringNote({ url: 'https://w.example', exchangeUrl: 'https://w.example' }), /already names/);
});
