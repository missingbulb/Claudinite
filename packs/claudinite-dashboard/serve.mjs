// The dashboard's host. `node packs/claudinite-dashboard/serve.mjs`, then open the
// URL it prints.
//
// WHY A SERVER AT ALL, for a page with no backend: the dashboard imports the
// engine's own scheduler modules rather than restating their vocabulary, and ES
// module imports are CORS-checked — from a `file://` origin every one of them is
// blocked. An `http://` origin is the whole requirement. Nothing here talks to
// GitHub, holds a credential, or is reachable off this machine: it binds loopback
// and serves the checkout read-only, so the page's only privileged conversation
// stays the browser's own, with the viewer's own token.
//
// Serving from the REPO ROOT is deliberate — the page's imports reach up out of its
// own directory into `engine/`, which is the point.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo root, from this file's own location — `packs/<id>/serve.mjs`, so two up.
// Never `process.cwd()`: the page is served by path, and a server started from
// anywhere but the root would serve a tree the imports cannot reach out of.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = '/packs/claudinite-dashboard/';
const port = Number(process.env.PORT ?? 8099);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // Containment: resolve first, then require the result to still be under ROOT, so
  // a `..` or an encoded traversal cannot reach outside the checkout.
  const target = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) { res.writeHead(403).end('Outside the repo'); return; }

  const file = path.endsWith('/') ? join(target, 'index.html') : target;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
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
});

server.on('error', (e) => {
  // A busy port is the one failure worth a word rather than a stack: it is what
  // happens when the last run is still up.
  if (e.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${port} is busy — another copy may be running. Try PORT=8100 node ${process.argv[1]}\n`);
    process.exit(1);
  }
  throw e;
});
