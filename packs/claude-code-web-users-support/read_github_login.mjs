// WHO THIS SESSION IS ON GITHUB: the login its token belongs to, which is what a person's pack
// is addressed by (user_pack_address.mjs). The harness names the person only by email and
// account UUID, so the login is read back from the API with the token the session already
// carries - `GH_TOKEN`, then `GITHUB_TOKEN` - and a token the API refuses hands over to the next.
//
// The token names whoever it was minted for. In a web session that is the GitHub account linked
// to the person's claude.ai account; an environment that sets a shared or bot token of its own
// in either variable makes every person in it that account. The README says so, because no
// read here can tell the two apart.
//
// FAIL-SOFT. Never throws: `{ login, via }` or `{ error }`, and the error is the sentence the
// session-start note quotes. `CLAUDINITE_GITHUB_USER_URL` replaces the endpoint, so a test can
// answer from a `data:` URL or a local server rather than the network.
//
// THROUGH THE PROXY. In a web session the tokens are placeholders the agent proxy swaps for the
// real credential, so a request that bypasses the proxy is refused with a 401. Node's built-in
// fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 was set when the process started, which
// the engine does not do for a pack step, so `readGithubLoginThroughProxy` runs the read in a
// child started with it. The child's stderr is not read: it carries undici's notice that its
// proxy agent is experimental, and nothing a caller needs.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isUsableLogin } from './user_pack_address.mjs';

const TIMEOUT_MS = 10_000;
const TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN'];

export async function readGithubLogin(env) {
  const url = env.CLAUDINITE_GITHUB_USER_URL || 'https://api.github.com/user';
  const held = TOKENS.filter((name) => env[name]);
  if (!held.length) return { error: 'neither GH_TOKEN nor GITHUB_TOKEN is set' };
  const misses = [];
  for (const name of held) {
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${env[name]}`, accept: 'application/vnd.github+json', 'user-agent': 'claudinite' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) { misses.push(`${name}: HTTP ${res.status}`); continue; }
      const { login } = await res.json();
      if (!isUsableLogin(login)) return { error: `${name} read back ${JSON.stringify(String(login)).replace(/\\/g, '')}, which is not a usable GitHub login` };
      return { login, via: name };
    } catch (e) {
      misses.push(`${name}: ${e.cause?.code || e.name || e.message}`);
    }
  }
  return { error: `GET /user answered no login (${misses.join('; ')})` };
}

export async function readGithubLoginThroughProxy(env) {
  if (!env.HTTPS_PROXY || env.NODE_USE_ENV_PROXY === '1') return readGithubLogin(env);
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...env, NODE_USE_ENV_PROXY: '1' },
    encoding: 'utf8',
    timeout: TOKENS.length * TIMEOUT_MS + 5_000,
  });
  try { return JSON.parse(child.stdout); } catch {
    return { error: `the login read exited ${child.status ?? child.signal} with no answer` };
  }
}

// Run directly, it is the child above: one read, its answer as JSON on stdout.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  readGithubLogin(process.env).then((r) => process.stdout.write(JSON.stringify(r)));
}
