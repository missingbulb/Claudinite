// The one piece of the dashboard that cannot run in the browser, as a deployable
// example. REFERENCE MATERIAL — nothing imports this, and the dashboard does not
// ship it anywhere; it is what you paste into a serverless function and point
// `dashboard.config.json`'s `exchangeUrl` at.
//
// WHY IT HAS TO EXIST. Turning an OAuth `code` into a token is a POST to
// `github.com/login/oauth/access_token` carrying the app's CLIENT SECRET. Two
// independent reasons that cannot happen in a static page: the secret would be
// public, and GitHub sends no CORS headers on that endpoint, so a browser is
// refused even with a secret in hand.
//
// WHAT IT IS NOT. Not a proxy and not a backend. It sees one code and returns one
// token; it never touches repo data, never stores anything, and is never called
// again for the rest of the session — the page talks to GitHub directly after this.
//
// Written for Cloudflare Workers (`export default { fetch }`). Netlify, Vercel and
// Deno Deploy take the same handler with a different wrapper.
//
// Secrets to set on the deployment: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET.
// `ALLOWED_ORIGINS` is a comma-separated list of the exact page origins allowed to
// call this — it is what stops a stranger's site from spending your app's identity.

const cors = (origin, allowed) => ({
  'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') ?? '';
    const headers = { ...cors(origin, allowed), 'Content-Type': 'application/json' };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, allowed) });
    if (request.method !== 'POST') return new Response('{"error":"method_not_allowed"}', { status: 405, headers });

    // Origin is checked in the handler too, not only in the CORS headers: CORS binds
    // browsers, and this endpoint is reachable by anything that can make an HTTPS
    // request.
    if (!allowed.includes(origin)) {
      return new Response('{"error":"origin_not_allowed"}', { status: 403, headers });
    }

    let body;
    try { body = await request.json(); } catch { body = null; }
    const code = body?.code;
    if (!code) return new Response('{"error":"missing_code"}', { status: 400, headers });

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: body.redirect_uri,
      }),
    });

    const data = await res.json().catch(() => ({}));
    // GitHub answers 200 with an `error` field on a bad code, so the status alone is
    // not the verdict — branch on the payload, or a failure reads as a success with
    // no token (basics: read the status, not just the body — here, both).
    if (!res.ok || data.error || !data.access_token) {
      return new Response(JSON.stringify({
        error: data.error ?? 'exchange_failed',
        error_description: data.error_description ?? `GitHub returned HTTP ${res.status}`,
      }), { status: 400, headers });
    }

    // Only the token travels back. Refresh tokens, if the app issues them, stay
    // unused rather than being handed to a page that has nowhere safe to keep them.
    return new Response(JSON.stringify({ access_token: data.access_token, token_type: data.token_type }), { status: 200, headers });
  },
};
