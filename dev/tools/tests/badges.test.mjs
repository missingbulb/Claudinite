import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks } from '../../../engine/pack_loader/pack-registry.mjs';
import { parseBadge, renderBadge, shade, restyleAll, badgeFiles, idForBadge } from '../badges/render.mjs';

// The badge files are the artwork's source of truth — a manifest names only the
// path — so there is nothing to regenerate them FROM, and the drift these tests
// guard is a different one: the shared template. `restyle` re-emits every badge
// around its own parsed colour and glyph, so a badge left behind by a template
// change (or hand-edited into a shape the tool can no longer read) fails here
// rather than sitting in the set looking subtly wrong.
//
// A badge is shown by the pack's own README and by the dashboard; nothing writes
// one into a member's README (#1750).

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

const tracked = () => new Set(execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean));

const packBadgePath = (pack) => `${pack.local ? '.claudinite/local/packs' : 'packs'}/${pack.id}/${pack.badge}`;


test('every pack declares a badge path, and the file it names is there and tracked', async () => {
  const known = tracked();
  const bad = [];
  for (const pack of await loadPacks({ localRoot: REPO })) {
    if (typeof pack.badge !== 'string' || !pack.badge.trim() || pack.badge.startsWith('/') || pack.badge.includes('..')) {
      bad.push(`${pack.id}: badge must be a path relative to the pack directory, e.g. badge: 'badge.svg'`);
      continue;
    }
    const rel = packBadgePath(pack);
    if (!existsSync(join(REPO, rel))) bad.push(`${pack.id}: declares ${pack.badge}, which does not exist`);
    else if (!known.has(rel)) bad.push(`${rel} is untracked — a badge git does not track ships to no consumer`);
  }
  assert.deepEqual(bad, []);
});

test('every badge is current with the template', () => {
  const { files, unreadable } = restyleAll(REPO);
  assert.deepEqual(unreadable, [], 'these files are not badges this tool can read — fix or delete them');
  const stale = [...files].filter(([rel, content]) => readFileSync(join(REPO, rel), 'utf8') !== content).map(([rel]) => rel);
  assert.deepEqual(stale, [], 'these badges were left behind by a template change — re-run `node dev/tools/badges/render.mjs restyle`');
});

test('every badge is titled with the pack whose directory holds it', () => {
  const wrong = badgeFiles(REPO)
    .map((rel) => ({ rel, spec: parseBadge(readFileSync(join(REPO, rel), 'utf8')) }))
    .filter(({ rel, spec }) => spec.id !== idForBadge(rel))
    .map(({ rel, spec }) => `${rel} is titled "${spec.id}"`);
  assert.deepEqual(wrong, [], 'a badge titled with another pack shows the wrong name on hover and in a screen reader');
});

// --- the renderer itself ----------------------------------------------------

const SPEC = { id: 'demo-pack', color: '#102030', glyph: 'M8 8h16' };

test('a badge is a self-contained 32px tile carrying its own colour and glyph', () => {
  const svg = renderBadge(SPEC);
  assert.match(svg, /viewBox="0 0 32 32" width="32" height="32"/);
  assert.match(svg, /<title>demo-pack<\/title>/);
  assert.match(svg, /stop-color="#102030"/);
  assert.match(svg, /d="M8 8h16"/);
  // The darkened stop is derived from the declared colour, never stored beside it.
  assert.match(svg, /stop-color="#0c1925"/);
  // Namespaced, or two badges in one document would paint with one fill.
  assert.match(svg, /id="b-demo-pack"/);
});

test('a rendered badge parses back into the spec that produced it', () => {
  assert.deepEqual(parseBadge(renderBadge(SPEC)), SPEC);
});

test('a file that is not a readable badge parses to null rather than a default', () => {
  assert.equal(parseBadge('<svg></svg>'), null);
  assert.equal(parseBadge(renderBadge(SPEC).replace(/<title>[^<]+<\/title>/, '')), null);
  assert.equal(parseBadge(renderBadge(SPEC).replace(/<path d="[^"]+"/, '<path')), null);
});

test('a colour that is not a #rrggbb hex is refused, not rendered', () => {
  assert.throws(() => renderBadge({ ...SPEC, color: 'blue' }), /#rrggbb/);
});

test('shading is clamped, so a near-black tile still renders a valid colour', () => {
  assert.equal(shade('#000000', -0.22), '#000000');
  assert.equal(shade('#ffffff', -0.22), '#c7c7c7');
});

test('a badge takes its id from the directory it sits in', () => {
  assert.equal(idForBadge('packs/tidy-repo/badge.svg'), 'tidy-repo');
  assert.equal(idForBadge('.claudinite/local/packs/claudinite/badge.svg'), 'claudinite');
});
