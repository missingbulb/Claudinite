// The dashboard's host. `node packs/claudinite-dashboard/tooling/serve.mjs`, then open the
// URL it prints.
//
// WHY A SERVER AT ALL, for a page with no backend: the dashboard imports the
// engine's own scheduler modules rather than restating their vocabulary, and ES
// module imports are CORS-checked — from a `file://` origin every one of them is
// blocked. An `http://` origin is the whole requirement. Nothing here talks to GitHub
// or is reachable off this machine: it binds loopback and serves the checkout
// read-only, so the page's only privileged conversation stays the browser's own.
//
// Serving from the REPO ROOT is deliberate — the page's imports reach up out of its
// own directory into `engine/`, which is the point.
//
// THE ONE THING IT DOES HOLD IS A CREDENTIAL, and only because the page now has no
// other way to get one: signing in needs a registered GitHub App, and a checkout on
// somebody's laptop has none and should not have to register one to be looked at. So
// the developer's own token — `DASHBOARD_DEV_TOKEN`, else `GITHUB_TOKEN`/`GH_TOKEN`,
// read from the environment and never a file or an argument, where it would land in a
// shell history — is handed to the page in the config this server synthesizes, and the
// page keeps it for the tab only (`src/read/auth.mjs`, `adoptDevCredential`). It stays
// a development affordance by construction: the site build writes a fixed list of
// config keys and `devToken` is not one of them, so nothing published can carry it.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo root, from this file's own location — `packs/<id>/tooling/serve.mjs`, so three up.
// Never `process.cwd()`: the page is served by path, and a server started from
// anywhere but the root would serve a tree the imports cannot reach out of.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const HOME = '/packs/claudinite-dashboard/';
const CONFIG_PATH = `${HOME}dashboard.config.json`;
const port = Number(process.env.PORT ?? 8099);
const devToken = (process.env.DASHBOARD_DEV_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

// A `dashboard.config.json` sitting in the checkout, or nothing. Unreadable and
// unparseable are the same answer as absent: this is a development convenience, and
// refusing to serve the page over a malformed file would be the server deciding
// something the page already handles.
async function fileConfig() {
  try { return JSON.parse(await readFile(join(ROOT, CONFIG_PATH.slice(1)), 'utf8')); } catch { return {}; }
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // The config, answered rather than served, because the credential has to arrive in
  // it and a checkout usually has no config at all — the build writes one. A file that
  // IS there is served as it stands with the token laid over it, so serving a
  // deployment's own declaration locally still shows that deployment's page. With
  // neither, `mode` goes unstated, which `isFleetConfig` reads as one repo's page and
  // `?repo=` names which.
  if (path === CONFIG_PATH) {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    res.end(`${JSON.stringify({ ...(await fileConfig()), devToken: devToken || null }, null, 2)}\n`);
    return;
  }
  // Containment: resolve first, then require the result to still be under ROOT, so
  // a `..` or an encoded traversal cannot reach outside the checkout.
  const target = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) { res.writeHead(403).end('Outside the repo'); return; }

  // THE PAGE LIVES UNDER `src/` AND IS SERVED FROM THE DIRECTORY ABOVE IT. An HTML
  // `src=` resolves against the document's URL, so the page's own script tag names
  // `./src/app.mjs` — true at the URL it is served from, not at the path it is stored
  // at. Serving it anywhere else would break every module it loads, so a directory
  // request tries the directory's own index first and then the one `src/` holds.
  const candidates = path.endsWith('/')
    ? [join(target, 'index.html'), join(target, 'src/index.html')]
    : [target];
  try {
    const file = (await Promise.all(candidates.map(async (c) => {
      try { return (await stat(c)).isFile() ? c : null; } catch { return null; }
    }))).find(Boolean);
    if (!file) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Not found: ${path}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  const repo = process.argv[2] ? `?repo=${encodeURIComponent(process.argv[2])}` : '';
  process.stdout.write(`Fleet status dashboard → http://127.0.0.1:${port}${HOME}${repo}\n`);
  // Said out loud, because the page's failure without one is a gate saying this
  // deployment is not set up — true of a Pages site, and misleading here.
  process.stdout.write(devToken
    ? '  credential: this shell\'s token, handed to the page for the tab\n'
    : '  credential: none — set DASHBOARD_DEV_TOKEN (or GITHUB_TOKEN) and restart, or the page has no way in\n');
});

server.on('error', (e) => {
  // A busy port is the one failure worth a word rather than a stack: it is what
  // happens when the last run is still up.
  if (e.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${port} is busy — another copy may be running. Try PORT=8100 node ${process.argv[1]}\n`);
    process.exitCode = 1;
    return;
  }
  throw e;
});
