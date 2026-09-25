import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readGithubLogin, readGithubLoginThroughProxy } from '../read_github_login.mjs';

// The one network read the pack makes, against a server in this process: a token it accepts,
// one it refuses, and a login it would be unsafe to address.
async function withUserApi(handler, body) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await body(`http://127.0.0.1:${server.address().port}/user`);
  } finally { server.close(); }
}
const answer = (tokens) => (req, res) => {
  const login = tokens[(req.headers.authorization || '').replace(/^Bearer /, '')];
  res.writeHead(login ? 200 : 401, { 'content-type': 'application/json' });
  res.end(JSON.stringify(login ? { login } : { message: 'Bad credentials' }));
};

test('GH_TOKEN is tried first, and GITHUB_TOKEN answers when it is refused', async () => {
  await withUserApi(answer({ good: 'acme-user', other: 'acme-bot' }), async (url) => {
    assert.deepEqual(await readGithubLogin({ CLAUDINITE_GITHUB_USER_URL: url, GH_TOKEN: 'good', GITHUB_TOKEN: 'other' }),
      { login: 'acme-user', via: 'GH_TOKEN' });
    assert.deepEqual(await readGithubLogin({ CLAUDINITE_GITHUB_USER_URL: url, GH_TOKEN: 'stale', GITHUB_TOKEN: 'other' }),
      { login: 'acme-bot', via: 'GITHUB_TOKEN' });
  });
});

test('every way the read can miss is an error naming it, never a throw', async () => {
  assert.match((await readGithubLogin({})).error, /neither GH_TOKEN nor GITHUB_TOKEN/);
  await withUserApi(answer({}), async (url) => {
    assert.match((await readGithubLogin({ CLAUDINITE_GITHUB_USER_URL: url, GH_TOKEN: 'stale' })).error, /401/);
  });
  await withUserApi(answer({ t: '../escape' }), async (url) => {
    assert.match((await readGithubLogin({ CLAUDINITE_GITHUB_USER_URL: url, GH_TOKEN: 't' })).error, /not a usable GitHub login/);
  });
  assert.ok((await readGithubLogin({ CLAUDINITE_GITHUB_USER_URL: 'http://127.0.0.1:9/user', GH_TOKEN: 't' })).error);
});

test('behind a proxy the read runs in a child that honours it, and answers the same', async () => {
  // A data: URL never touches the proxy, so this proves the hand-off - the child started with
  // NODE_USE_ENV_PROXY and its answer parsed back - rather than the proxy itself.
  const data = `data:application/json,${encodeURIComponent(JSON.stringify({ login: 'acme-user' }))}`;
  const env = { PATH: process.env.PATH, HTTPS_PROXY: 'http://127.0.0.1:9', CLAUDINITE_GITHUB_USER_URL: data, GH_TOKEN: 't' };
  assert.deepEqual(await readGithubLoginThroughProxy(env), { login: 'acme-user', via: 'GH_TOKEN' });
  assert.match((await readGithubLoginThroughProxy({ ...env, GH_TOKEN: '' })).error, /neither GH_TOKEN/);
});
