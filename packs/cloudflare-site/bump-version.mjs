#!/usr/bin/env node
//
// The version a release cuts, and the copy of it the pages carry.
//
// Scheme: `<major>.<mmdd>.<n>`
//   - major  is carried over from the version already recorded — a generation
//            statement, raised by hand and never by a release
//   - minor  is the release date as zero-padded UTC month+day
//   - patch  is a monotonic counter: previous patch + 1, so it advances even when
//            the day (and therefore the minor) rolls over
//
// `package.json` is the single source of truth, and the release commits the bumped
// files back to the default branch — so the number in the repo always names the
// last release that actually went out.
//
// A page states where its copy goes by carrying `title="version …"` on whatever
// element should show it (a footer copyright, a build line). That attribute is
// GENERATED from `package.json`; `version-stamp-matches-package` fails the build
// when the two disagree, and `--stamp-only` re-stamps from the version already
// recorded, repairing a drift (a bad merge, a page added without the stamp)
// without consuming a version number.
//
// Prints the version to stdout and nothing else, so a caller can capture it.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseWranglerConfig, publishedDir, WRANGLER_CONFIGS } from './lib.mjs';

// The stamp as authored: `title="version 1.0913.7"`, anywhere on a page. Exported
// so the generator and the drift check spell it one way.
export const STAMP = /title="version [^"]*"/g;

// The version that follows `current`, released at `now`. An unparseable patch
// (the initial "1.0.0", a hand-typed string) counts as 0, so the first bump lands
// on 1 rather than NaN.
export function nextVersion(current, now = new Date()) {
  const [major, , patch] = String(current ?? '').split('.');
  const prevPatch = Number.parseInt(patch, 10);
  const mmdd = now.toISOString().slice(5, 10).replace('-', '');
  return `${/^\d+$/.test(major ?? '') ? major : '1'}.${mmdd}.${(Number.isFinite(prevPatch) ? prevPatch : 0) + 1}`;
}

// One page's stamp. A page carrying no `title="version …"` is returned unchanged —
// it has not asked for the version, and nothing is inserted into markup here.
export function stampHtml(html, version) {
  return html.replace(STAMP, `title="version ${version}"`);
}

// Stamp every page under `dir`, recursively, in place. Returns the paths it rewrote.
export function stampPages(dir, version) {
  const stamped = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { stamped.push(...stampPages(path, version)); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const html = readFileSync(path, 'utf8');
    const next = stampHtml(html, version);
    if (next === html) continue;
    writeFileSync(path, next);
    stamped.push(path);
  }
  return stamped;
}

// The published tree of the repo at `repoRoot`, read from its wrangler config.
export function repoPublishedDir(repoRoot) {
  for (const name of WRANGLER_CONFIGS) {
    let text;
    try { text = readFileSync(join(repoRoot, name), 'utf8'); } catch { continue; }
    const dir = publishedDir(parseWranglerConfig(text), name);
    if (dir) return dir;
  }
  return null;
}

// Advance `package.json` and stamp the published pages under `repoRoot`, returning
// the new version. `stampOnly` re-stamps from the version already recorded.
export function bump(repoRoot, { now = new Date(), stampOnly = false } = {}) {
  const pkgPath = join(repoRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const version = stampOnly ? pkg.version : nextVersion(pkg.version, now);
  if (!stampOnly) writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
  const dir = repoPublishedDir(repoRoot);
  if (dir) stampPages(join(repoRoot, dir), version);
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Run from the repo it is bumping: the mount sits at .claudinite/shared/packs/<id>/,
  // so `--root` names the checkout when the cwd is not it.
  const flag = process.argv.indexOf('--root');
  const root = flag === -1 ? process.env.CLAUDE_PROJECT_DIR || process.cwd() : process.argv[flag + 1];
  console.log(bump(root, { stampOnly: process.argv.includes('--stamp-only') }));
}
