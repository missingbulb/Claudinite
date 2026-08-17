// How the page gets a credential. Two providers, chosen by configuration.
//
// WHAT IS NOT POSSIBLE, because it is the first thing anyone asks for: a static
// page CANNOT reuse the viewer's existing github.com login. Session cookies belong
// to github.com and are not sent to api.github.com, and the API does not accept
// cookie auth cross-origin under any circumstances. "Already logged in" is not a
// credential a browser can spend, so there is no configuration that avoids an
// explicit sign-in of some kind.
//
// What IS possible is making that sign-in a BUTTON rather than a paste box, which
// is the `oauth` provider below: the viewer clicks Sign in, GitHub asks them to
// authorize (once), and everything after runs as them, with exactly the repos and
// permissions their account already has. That is the honest version of "the current
// user's logged-in permissions".
//
// The one piece that cannot live here: exchanging the returned `code` for a token
// needs the app's client secret, and GitHub's token endpoint sends no CORS headers,
// so a browser cannot make that call even if the secret were public. It therefore
// happens at a configured `exchangeUrl` — a few lines of serverless function whose
// only job is that swap. It never sees repo data: once the token is back, the page
// talks to GitHub directly.
//
// `token` remains as the fallback for local development and for anyone who would
// rather paste a PAT than register an app.

const STATE_KEY = 'claudinite-dashboard:oauth-state';
const TOKEN_KEY = 'claudinite-dashboard:token';

// The credential lives in sessionStorage, not localStorage: it is a user access
// token, it should die with the tab, and it must not outlive the browser session on
// a shared machine. The PAT provider deliberately uses the same store — a pasted
// token is no less sensitive for having been typed.
const store = {
  get() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set(t) { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

export const currentToken = () => store.get();
export const signOut = () => store.set('');

// A `remember me` box would mean localStorage, and a token that survives the tab is
// a different security decision than this page is entitled to make on the viewer's
// behalf. Kept explicit so the omission reads as a choice.

const randomState = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export function isOAuthConfigured(config) {
  return Boolean(config?.clientId && config?.exchangeUrl);
}

// Send the viewer to GitHub. `state` is stored and checked on return — without it,
// a third party could hand the viewer a crafted callback URL and have the page
// exchange a code that is not theirs.
export function beginSignIn(config) {
  const state = randomState();
  try { sessionStorage.setItem(STATE_KEY, state); } catch { /* private mode */ }
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri ?? location.origin + location.pathname);
  url.searchParams.set('state', state);
  // A GitHub App's user token carries the app's installed permissions, so no scope
  // is requested there. A classic OAuth App needs to ask, and read-only is the
  // narrowest that can see private repos' issues and runs.
  if (config.scope) url.searchParams.set('scope', config.scope);
  location.assign(url.toString());
}

// Handle a `?code=` landing. Returns:
//   { status: 'signed-in' }              — a token was obtained and stored
//   { status: 'none' }                   — this was not a callback; carry on
//   { status: 'error', message }         — a callback that failed, with the reason
//
// The URL is scrubbed either way: a `code` left in the address bar gets copied into
// chat messages and browser history, and it is a credential until it is spent.
export async function completeSignIn(config, { search = location.search, replaceUrl = true } = {}) {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const oauthError = params.get('error');

  const scrub = () => {
    if (!replaceUrl) return;
    const url = new URL(location.href);
    for (const k of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(k);
    history.replaceState(null, '', url);
  };

  if (oauthError) {
    scrub();
    return { status: 'error', message: params.get('error_description') || oauthError };
  }
  if (!code) return { status: 'none' };

  let expected = null;
  try { expected = sessionStorage.getItem(STATE_KEY); } catch { /* private mode */ }
  try { sessionStorage.removeItem(STATE_KEY); } catch { /* ignore */ }

  // A mismatch is not a retryable error — it means this callback was not started by
  // this tab, so the code is not spent and the viewer is told to start again.
  if (!expected || expected !== returnedState) {
    scrub();
    return { status: 'error', message: 'Sign-in state did not match. Start the sign-in again from this page.' };
  }

  try {
    const res = await fetch(config.exchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code, redirect_uri: config.redirectUri ?? location.origin + location.pathname }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      scrub();
      return { status: 'error', message: data.error_description || data.error || `Token exchange failed (HTTP ${res.status}).` };
    }
    store.set(data.access_token);
    scrub();
    return { status: 'signed-in' };
  } catch (e) {
    scrub();
    return { status: 'error', message: `Token exchange unreachable — ${e.message}` };
  }
}

export const setPastedToken = (t) => store.set(String(t ?? '').trim());
