// Assemble the publishable site from the mount.
//
// Run by the `publish-pages` task, which pushes what this produces to `gh-pages` for
// the seeded workflow to deploy; and by hand, from the member's root, to see what a
// run would publish:
//   node .claudinite/shared/packs/claudinite-dashboard/build-site.mjs [--out _site]
//
// Reads its deployment settings through `deployment-config.mjs`, which is also what the
// deploy-oauth-exchange task reads, so the button and the endpoint it calls cannot be
// configured against different apps. That module owns which store each key lives in.
// Every key is optional.
//
// INERT RATHER THAN FAILING. A repo whose mount does not yet carry this pack's page
// (adopted, not yet converged) exits clean having produced nothing. That is an ordinary
// state on a fleet, not a fault, and failing on it would paint every run red until the
// converge caught up.

import { cp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMode } from './config.mjs';
import { deploymentConfig } from './deployment-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The page imports the queue's own modules by relative path — the tasks pack's published
// `shared-code/`, and the engine surface beneath it — precisely so it cannot drift from
// them. The published tree therefore has to preserve that shape: flattening the dashboard
// to the site root sends those imports above the root and the page does not boot. So every
// directory it reaches is staged at the depth it already has, and the site root is a redirect.
const HOME = 'packs/claudinite-dashboard';
const ENGINE = 'engine';
const TASKS = 'packs/claudinite-tasks';

// Local-only or explanatory files. None belong on a published site — `serve.mjs` least
// of all, being a file server's source sitting where it reads as part of the page.
const NOT_PUBLISHED = ['serve.mjs', 'build-site.mjs', 'pack.mjs', 'oauth-exchange.mjs',
  'dashboard.config.example.json', 'README.md', 'badge.svg', 'stubs', 'tasks'];

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

// The mount this pack was read from, and the repo root above it. Resolved from this
// file's own location rather than from `process.cwd()`, so the script works wherever it
// is invoked from.
const mountRoot = resolve(HERE, '../..');            // .claudinite/shared  (or the canon root)
const repoRoot = resolve(arg('root', process.cwd()));
const OUT = resolve(repoRoot, arg('out', '_site'));

// This script ships inside the page's own directory, so that directory is `HERE` —
// no path guessing, and it stays right if the pack is ever renamed.
const pageSource = HERE;
const engineSource = join(mountRoot, ENGINE);
const tasksSource = join(mountRoot, TASKS);

if (!await exists(join(pageSource, 'index.html')) || !await exists(engineSource)) {
  process.stdout.write(
    `No dashboard in the mount at ${pageSource} — nothing to publish. `
    + 'The next converge that delivers this pack will make this build produce a site.\n',
  );
  process.exit(0);
}

// --- settings, from the member's own declaration ---------------------------------

const { cfg, legacy } = await deploymentConfig(repoRoot);
// A deployment still carrying the sign-in pair in its declaration builds correctly and
// is told, once, where the pair lives now. Silence here would leave it on the old
// footing indefinitely, since nothing converges a member's own settings file.
if (legacy.length) {
  process.stdout.write(`NOTE: sign-in read from the declaration for ${legacy.join(', ')} — repository variables take precedence.\n`);
}

// --- stage ------------------------------------------------------------------------

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, HOME), { recursive: true });

await cp(pageSource, join(OUT, HOME), { recursive: true });
// The whole engine tree rather than a hand-picked subset: the page's import graph is
// the engine's business and may grow a module, and a curated copy would break silently
// the first time it did. It discloses nothing — the mount is already committed in this
// repo, so every byte is as public as the repo is.
await cp(engineSource, join(OUT, ENGINE), { recursive: true });
// The queue modules the page reads, at the same depth, for the same reason.
if (await exists(tasksSource)) await cp(tasksSource, join(OUT, TASKS), { recursive: true });

for (const f of NOT_PUBLISHED) await rm(join(OUT, HOME, f), { recursive: true, force: true });

await writeFile(join(OUT, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Claudinite tasks</title>
<link rel="icon" href="./${HOME}/favicon.svg" type="image/svg+xml">
<meta http-equiv="refresh" content="0; url=./${HOME}/">
<link rel="canonical" href="./${HOME}/">
</head>
<body><p>Continue to the <a href="./${HOME}/">task dashboard</a>.</p></body>
</html>
`);

// Pages runs uploaded artifacts through Jekyll unless told otherwise, and Jekyll drops
// files and directories beginning with an underscore.
await writeFile(join(OUT, '.nojekyll'), '');

// --- the roster --------------------------------------------------------------------

// WHICH DASHBOARD THIS DEPLOYMENT IS, and it is decided by SHAPE rather than by a mode
// switch: a declaration that says where more than one member comes from builds the
// fleet dashboard, and anything else builds this repo's own. So there is nothing to ask
// at adoption, nothing to keep in step, and no way to configure a roster and still get
// the wrong landing page.
//
// Three ways to say where the members come from, in precedence order:
//   repos      — an explicit list, for a deployment that wants a fixed set;
//   rosterFile — a generated artifact in this repo (the legacy shape);
//   owner      — enumerate that owner's repos IN THE BROWSER, as the viewer.
//
// The third is the one to use. It stores no repo list anywhere, and it means the fleet
// a person sees is exactly the fleet they can read — a member outside their access is
// not in it, rather than being in it as a row they cannot open.
let repos = Array.isArray(cfg.repos) ? cfg.repos.filter((r) => /^[^/\s]+\/[^/\s]+$/.test(r)) : [];
let rosterUrl = null;

if (!repos.length && cfg.rosterFile) {
  try {
    const doc = JSON.parse(await readFile(join(repoRoot, cfg.rosterFile), 'utf8'));
    const names = Array.isArray(doc) ? doc
      : Array.isArray(doc?.repos) ? doc.repos
        : doc?.repos && typeof doc.repos === 'object' ? Object.keys(doc.repos) : [];
    repos = names.filter((r) => typeof r === 'string' && /^[^/\s]+\/[^/\s]+$/.test(r)).sort();
  } catch {
    // A roster the member named but this cannot read is worth saying out loud: the site
    // would otherwise publish as a single-repo dashboard and look intentional.
    process.stdout.write(`WARNING: rosterFile ${cfg.rosterFile} could not be read — the site will cover only this repo.\n`);
  }
}
if (repos.length) {
  rosterUrl = './fleet-roster.GENERATED.json';
  // Only the names travel: a fleet artifact is usually a large statistics file the
  // dashboard never reads, and a page should not download it to fill a dropdown.
  await writeFile(join(OUT, HOME, 'fleet-roster.GENERATED.json'), `${JSON.stringify({ repos }, null, 2)}\n`);
} else if (cfg.rosterUrl) {
  rosterUrl = cfg.rosterUrl;
}

// --- the config the page reads -------------------------------------------------------

const repoSlug = process.env.GITHUB_REPOSITORY ?? null;
// Which dashboard this is — STATED by the declaration, and refused when it is not. The
// judgment is resolveMode's alone so the build and the page cannot drift apart; what is
// added here is that the build reads the roster off `rosterFile` too, and by this point
// has already resolved it into `repos`.
let fleetMode;
try {
  fleetMode = resolveMode({ ...cfg, rosterUrl: rosterUrl ?? cfg.rosterUrl }) === 'fleet';
} catch (e) {
  process.stderr.write(`claudinite-dashboard: ${e.message}\n`);
  process.exit(1);
}
const config = {
  mode: fleetMode ? 'fleet' : 'repo',
  clientId: cfg.clientId ?? null,
  exchangeUrl: cfg.exchangeUrl ?? null,
  redirectUri: cfg.redirectUri ?? null,
  canonRepo: cfg.canonRepo ?? null,
  // Whose repos a fleet deployment covers, enumerated in the browser as the viewer, and
  // which of them are not members. Both travel through as they stand: this build has no
  // credential to enumerate with, and would be the wrong place to try — a list resolved
  // here would be the same list for every viewer.
  owner: cfg.owner ?? null,
  exclude: Array.isArray(cfg.exclude) ? cfg.exclude : [],
  rosterUrl,
  repos: [],
  // In fleet mode the overview is the landing view, so nothing is preselected; in repo
  // mode there is exactly one repo to show and it is this one.
  defaultRepo: fleetMode ? null : (cfg.defaultRepo ?? repoSlug),
  // The rate table travels through as it stands, like every other declared key. It is
  // ordinary config rather than a secret — a published price list — and UNSET is a
  // valid deployment: the page then reads every dollar figure as unpriced and names
  // the key, which is a stated gap rather than a wrong number.
  rates: (cfg.rates && typeof cfg.rates === 'object') ? cfg.rates : null,
};
await writeFile(join(OUT, HOME, 'dashboard.config.json'), `${JSON.stringify(config, null, 2)}\n`);

// Say which mode the site actually built in. Sign-in quietly not being configured, or a
// fleet roster quietly not arriving, are exactly the things nobody notices until they
// wonder why the page is asking for a token or showing one repo.
const signIn = config.clientId && config.exchangeUrl
  ? 'configured'
  : `NOT configured — the site will ask for a token${config.clientId ? ' (exchangeUrl missing)' : ''}${config.exchangeUrl ? ' (clientId missing)' : ''}`;
const covers = repos.length ? `${repos.length} named members`
  : cfg.owner ? `every repo under ${cfg.owner} the viewer can read${config.exclude.length ? `, less ${config.exclude.length} excluded` : ''}`
    : rosterUrl ? `whatever ${rosterUrl} names`
      : `this repo${config.defaultRepo ? ` (${config.defaultRepo})` : ''}`;
process.stdout.write(
  `Built ${OUT}\n`
  + `  mode: ${fleetMode ? 'fleet-dashboard' : 'repo-dashboard'} (declared)\n`
  + `  covers: ${covers}\n`
  + `  canon reference: ${config.canonRepo ?? 'not set — member mount freshness reads unknown'}\n`
  + `  sign-in: ${signIn}\n`,
);
