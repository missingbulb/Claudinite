// Deploy the sign-in endpoint — the pack's `oauth-exchange.mjs` — onto Cloudflare
// Workers, and prove the deployed URL answers before reporting it.
//
// WHAT IS BEING DEPLOYED, and why it is a deployment at all rather than a page file:
// turning an OAuth `code` into a token needs the app's client secret and hits an
// endpoint that sends no CORS headers, so the browser cannot do it. The rest of
// sign-in is the page's. See the endpoint's own header for that argument in full.
//
// Runnable by hand as well as by the task, from anywhere:
//   node deploy.mjs --root /path/to/member [--dry-run]
//
// WHAT IT READS, and each value sits where its own sensitivity puts it. The
// endpoint's public half — the app's client id and which page origins may call it —
// comes from the member's own `claudinite-dashboard` declaration, the same file the
// site build reads, so the button and the endpoint it calls cannot be configured
// against different apps. The two real credentials are repo Actions secrets, the
// only store code-work ever sees a secret value from. The Cloudflare account id is
// neither: it is in every dashboard URL its owner opens, so it is a repository
// VARIABLE, which the executor hands to every task's code-work with nothing
// declared.
//
// IDEMPOTENT. The upload is a PUT of the whole script and its bindings, so a
// re-run redeploys the same worker to the same URL; nothing accumulates and there
// is no state to reconcile. Re-running after rotating the client secret is how the
// rotation reaches the endpoint.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deploymentConfig, SIGN_IN_VARS } from '../../deployment-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The endpoint's source, in the pack above this task. One canonical spelling of the
// path; nothing else here names the file.
export const SOURCE = resolve(HERE, '../../oauth-exchange.mjs');

const API = 'https://api.cloudflare.com/client/v4';

// The name the worker is deployed under, and so the first label of its URL. A
// deployment that wants a different one says `workerName`; every other deployment
// gets this, because one owner runs one exchange endpoint for every dashboard they
// publish and it needs no per-repo identity.
export const DEFAULT_WORKER_NAME = 'claudinite-oauth-exchange';

// The Workers runtime behaviour this script is written against. Pinned, and pinned
// PAST rather than at today: a compatibility date is a promise that later
// backwards-incompatible runtime fixes will not reach this worker, so it is a
// property of the code, not of when the deploy ran. The endpoint uses `fetch`,
// `Request`/`Response` and `URL` and nothing dated beyond them.
export const COMPATIBILITY_DATE = '2024-01-01';

// A park the operator can act on, in the executor's own vocabulary: the last marker
// printed decides the lane, and `action` means something outside the code must
// change before this can run.
export class NeedsAction extends Error {}

const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };

// WHICH PAGE ORIGINS MAY SPEND THIS APP'S IDENTITY. Three sources, narrowest first,
// because the answer is a security boundary and a wrong guess is a stranger's site
// minting tokens against your app:
//   allowedOrigins — stated by the declaration; a custom domain has no other source
//   redirectUri    — the deployed page, whose origin is by definition allowed
//   the repo owner — `https://<owner>.github.io`, which is every project Pages site
//                    that owner publishes, and the ordinary case
// Never a wildcard and never derived from the request: the endpoint checks this list
// in its own handler precisely because CORS binds browsers and nothing else.
export function resolveOrigins(cfg, repoSlug) {
  const stated = Array.isArray(cfg.allowedOrigins) ? cfg.allowedOrigins
    : typeof cfg.allowedOrigins === 'string' ? cfg.allowedOrigins.split(',') : [];
  const origins = stated.map((o) => originOf(String(o).trim())).filter(Boolean);
  if (origins.length) return origins;

  const fromRedirect = cfg.redirectUri ? originOf(cfg.redirectUri) : null;
  if (fromRedirect) return [fromRedirect];

  const owner = String(repoSlug ?? '').split('/')[0];
  if (owner) return [`https://${owner.toLowerCase()}.github.io`];
  return [];
}

async function cf(token, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    body,
  });
  let json = null;
  try { json = await res.json(); } catch { /* a body that is not JSON is reported by status alone */ }
  // BOTH halves. Cloudflare answers some refusals 200 with `success: false`, so the
  // status alone is not the verdict — and a transport-level failure carries no
  // `success` field at all, so the body alone is not either.
  if (!res.ok || json?.success !== true) {
    const detail = (json?.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ')
      || `HTTP ${res.status}`;
    const err = new Error(`${method} ${path} — ${detail}`);
    err.status = res.status;
    throw err;
  }
  return json.result;
}

// The upload: the whole script and the whole binding set in one PUT. `bindings` is
// declarative and replaces what the worker had, so a binding dropped from this list
// is dropped from the deployment — which is what keeps a rotated secret from
// sitting beside a stale one.
export function uploadForm(source, { clientId, clientSecret, origins }, { FormDataImpl = FormData, BlobImpl = Blob } = {}) {
  const filename = 'oauth-exchange.mjs';
  const form = new FormDataImpl();
  form.append('metadata', JSON.stringify({
    main_module: filename,
    compatibility_date: COMPATIBILITY_DATE,
    bindings: [
      // Public by nature — the client id is in the page's own config and in every
      // authorize URL — so it is plain text rather than a secret pretending.
      { type: 'plain_text', name: 'GITHUB_CLIENT_ID', text: clientId },
      { type: 'plain_text', name: 'ALLOWED_ORIGINS', text: origins.join(',') },
      { type: 'secret_text', name: 'GITHUB_CLIENT_SECRET', text: clientSecret },
    ],
  }));
  form.append(filename, new BlobImpl([source], { type: 'application/javascript+module' }), filename);
  return form;
}

// Prove the deployed URL is actually serving this endpoint, by the two answers only
// this code gives: a disallowed origin is refused, and an allowed one with no code
// is a bad request. Together they show the route is live, the handler is ours, and
// the origin allowlist is the one just uploaded — none of which the upload's own
// 200 says. A fresh route takes a few seconds to propagate, so a miss is retried
// before it is believed.
export async function probe(url, allowedOrigin, { fetchImpl = fetch, attempts = 6, waitMs = 5000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const post = (origin) => fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: '{}',
  });
  let last = 'never answered';
  for (let i = 0; i < attempts; i += 1) {
    if (i) await sleep(waitMs);
    try {
      const stranger = await post('https://claudinite-deploy-probe.invalid');
      const strangerBody = await stranger.json().catch(() => ({}));
      if (stranger.status !== 403 || strangerBody.error !== 'origin_not_allowed') {
        last = `a disallowed origin got HTTP ${stranger.status} ${JSON.stringify(strangerBody)}, expected 403 origin_not_allowed`;
        continue;
      }
      const ours = await post(allowedOrigin);
      const oursBody = await ours.json().catch(() => ({}));
      if (ours.status !== 400 || oursBody.error !== 'missing_code') {
        last = `${allowedOrigin} got HTTP ${ours.status} ${JSON.stringify(oursBody)}, expected 400 missing_code`;
        continue;
      }
      return { ok: true, attempts: i + 1 };
    } catch (e) {
      last = e.message;
    }
  }
  return { ok: false, why: last };
}

export async function deploy({ repoRoot, env = process.env, dryRun = false, log = console.log, fetchImpl = fetch } = {}) {
  const { cfg } = await deploymentConfig(repoRoot, env);
  const repoSlug = env.CLAUDINITE_REPO || env.GITHUB_REPOSITORY || '';

  // A repository variable, not a secret — see the header.
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  const clientId = String(cfg.clientId ?? '').trim();

  // The three things this cannot invent, each named on its own: a combined "not
  // configured" tells the operator to go and look rather than what to set.
  if (!clientId) {
    throw new NeedsAction(`no client id — register the GitHub App first and set the repository `
      + `variable ${SIGN_IN_VARS.clientId} to its client id; the endpoint is minted for one app`);
  }
  const origins = resolveOrigins(cfg, repoSlug);
  if (!origins.length) {
    throw new NeedsAction('no page origin could be resolved — set `allowedOrigins` (or `redirectUri`) '
      + 'in the declaration\'s claudinite-dashboard config to the exact origin the dashboard is served from');
  }

  const name = String(cfg.workerName ?? DEFAULT_WORKER_NAME).trim();
  const source = await readFile(SOURCE, 'utf8');

  log(`deploying ${name} for client id ${clientId}`);
  log(`  origins allowed to call it: ${origins.join(', ')}`);

  if (dryRun) {
    log('dry run — nothing was uploaded');
    return { dryRun: true, name, origins, clientId };
  }
  // The queue names a declared secret it does not carry, so the two credentials park
  // themselves. The account id is a variable and nothing declares it, which is what
  // makes naming it here this code's job rather than the executor's.
  if (!accountId) {
    throw new NeedsAction('set the repository variable CLOUDFLARE_ACCOUNT_ID '
      + '(Settings → Secrets and variables → Actions → Variables) to the account hosting the endpoint');
  }
  const missing = [!apiToken && 'CLOUDFLARE_API_TOKEN', !clientSecret && 'GITHUB_OAUTH_CLIENT_SECRET'].filter(Boolean);
  if (missing.length) throw new NeedsAction(`set the repo Actions secret(s): ${missing.join(', ')}`);

  const call = (path, opts) => cf(apiToken, path, opts);

  // The account's workers.dev subdomain, which is the second label of every worker
  // URL it hosts. An account that has never claimed one has no URL to give.
  const { subdomain } = await call(`/accounts/${accountId}/workers/subdomain`);
  if (!subdomain) {
    throw new NeedsAction('this Cloudflare account has no workers.dev subdomain — '
      + 'claim one in the dashboard (Workers & Pages → Subdomain) and re-run');
  }

  await call(`/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: uploadForm(source, { clientId, clientSecret, origins }),
  });
  log('  uploaded');

  // Routing is a separate fact from the code: a worker with no workers.dev route
  // uploads cleanly and answers nothing. Previews stay off — a preview URL is a
  // second origin able to mint tokens, which is exactly what the allowlist exists
  // to prevent.
  await call(`/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}/subdomain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, previews_enabled: false }),
  });

  const url = `https://${name}.${subdomain}.workers.dev`;
  log(`  routed at ${url}`);

  const verdict = await probe(url, origins[0], { fetchImpl });
  if (!verdict.ok) {
    // A deployed-but-not-answering endpoint is a failure of this run, not a park:
    // the upload landed and something about the deployment is wrong, which is a
    // trace to read rather than a setting to change.
    throw new Error(`${url} did not answer as the exchange endpoint — ${verdict.why}`);
  }
  log(`  verified live (refuses a stranger's origin, accepts ${origins[0]})`);

  return { name, url, origins, clientId, exchangeUrl: cfg.exchangeUrl ?? null };
}

// What is left to do, said in full rather than as "now configure it": the endpoint
// is live from the moment it deploys, but the button appears only once the
// declaration names it, and that edit is the member's own file.
export function wiringNote({ url, exchangeUrl }) {
  const name = SIGN_IN_VARS.exchangeUrl;
  if (exchangeUrl === url) return `${name} already names ${url} — sign-in is fully wired.`;
  return `NOT YET WIRED: set the repository variable ${name} to ${url}`
    + `${exchangeUrl ? ` (it currently resolves to ${exchangeUrl})` : ''}. `
    + 'Until it does, the page renders the token box and no Sign in button.';
}

export async function main({ argv = process.argv, env = process.env, log = console.log } = {}) {
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1]; };
  const repoRoot = resolve(arg('root') ?? env.CLAUDINITE_REPO_ROOT ?? process.cwd());
  const result = await deploy({ repoRoot, env, dryRun: argv.includes('--dry-run'), log });
  if (!result.dryRun) log(wiringNote(result));
  return result;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof NeedsAction
      ? `claudinite-needs-human: action — ${e.message}`
      : `deploy-oauth-exchange failed: ${e.stack ?? e.message}`);
    process.exit(1);
  });
}
