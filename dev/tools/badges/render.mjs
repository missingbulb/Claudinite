import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Pack badges — the small square mark a pack carries so a repo's README can
// show which Claudinite packs it runs.
//
// **The badge file is the artwork's source of truth.** A pack's manifest names
// only the path (`badge: 'badge.svg'`); the colour and the glyph live in the SVG
// itself, where they are visible to anyone who opens the file and editable
// without touching a manifest. This tool never invents either — it PARSES both
// out of the file it is about to rewrite, and re-emits them inside the current
// template. That is what makes a set-wide restyle (a new corner radius, a
// different stroke weight, a stats badge in the corner later) one edit here
// followed by one `restyle` run, while each pack keeps its own identity.
//
// It lives in dev/tools/, not in engine/: nothing at session time reads a badge.
// The engine is what runs pack content and what every consumer vendors; a
// maintainer-side image generator is neither.
//
//   node dev/tools/badges/render.mjs restyle
//   node dev/tools/badges/render.mjs new packs/<pack>/badge.svg '#4f46e5' 'M8 8h16'

const REPO = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

// The tile. 32px is the size a README row wants — a glyph still reads, and a row
// of them costs one line of vertical space. The artwork is SVG, so this fixes
// the layout, never the fidelity.
export const BADGE_SIZE = 32;
const CORNER = 8;
const STROKE = 2.2;

// The glyph ink. One value, deliberately: a badge is a saturated tile with white
// line art on it, so it reads the same against a light or a dark README.
const INK = '#ffffff';

const BANNER = '<!-- A Claudinite pack badge. The colour and glyph below are this file\'s own —'
  + ' dev/tools/badges/render.mjs re-renders the template around them. -->';

const HEX = /^#[0-9a-fA-F]{6}$/;

// A flat tile reads as a sticker; a hair of vertical shade reads as a mark. The
// second stop is derived from the first, so the file carries one colour and the
// pair can never half-update.
export function shade(hex, amount) {
  const ch = (i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(Math.max(0, Math.min(255, v * (1 + amount))));
  };
  return `#${[0, 1, 2].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`;
}

// Pull a badge's identity back out of a rendered file: the pack it names, the
// colour it is filled with, and the glyph path drawn on it. Returns null when
// the file is not a badge this tool wrote — a restyle must rewrite nothing it
// cannot first read, or it would silently replace hand-drawn artwork with a
// default.
export function parseBadge(svg) {
  const id = /<title>([^<]+)<\/title>/.exec(svg)?.[1];
  const color = /<stop offset="0" stop-color="(#[0-9a-fA-F]{6})"\/>/.exec(svg)?.[1];
  const glyph = /<path d="([^"]+)"/.exec(svg)?.[1];
  if (!id || !color || !glyph) return null;
  return { id, color, glyph };
}

// One badge, from the three facts that make it its pack's. The gradient id is
// namespaced by pack id so two badges can sit in one document.
export function renderBadge({ id, color, glyph }) {
  if (!HEX.test(color)) throw new Error(`badge colour must be a #rrggbb hex, got "${color}"`);
  return [
    BANNER,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BADGE_SIZE} ${BADGE_SIZE}" width="${BADGE_SIZE}" height="${BADGE_SIZE}" role="img" aria-label="Claudinite pack: ${id}">`,
    `  <title>${id}</title>`,
    '  <defs>',
    `    <linearGradient id="b-${id}" x1="0" y1="0" x2="0" y2="1">`,
    `      <stop offset="0" stop-color="${color}"/>`,
    `      <stop offset="1" stop-color="${shade(color, -0.22)}"/>`,
    '    </linearGradient>',
    '  </defs>',
    `  <rect width="${BADGE_SIZE}" height="${BADGE_SIZE}" rx="${CORNER}" fill="url(#b-${id})"/>`,
    `  <path d="${glyph}" fill="none" stroke="${INK}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
    '',
  ].join('\n');
}

// Every badge in the repo, found through git rather than a hardcoded list of
// pack roots — git already knows which files are ours, and a pack that moves
// (or a consumer's own local pack) needs no edit here.
export const badgeFiles = (root = REPO) =>
  execFileSync('git', ['ls-files', '*/badge.svg'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

// What every badge file SHOULD contain, given what it currently contains:
// path → re-rendered text. A file this tool cannot parse is reported instead,
// never overwritten.
//
// The colour and glyph come from the file, which owns them; the ID comes from the
// PATH, which owns that. Reading the id back out of the title would carry a renamed
// pack's old name forward forever — the title, the aria-label and the gradient id all
// still spelling a pack that no longer exists, and a restyle reporting nothing to do.
export function restyleAll(root = REPO) {
  const files = new Map();
  const unreadable = [];
  for (const rel of badgeFiles(root)) {
    const spec = parseBadge(readFileSync(join(root, rel), 'utf8'));
    if (spec === null) unreadable.push(rel);
    else files.set(rel, renderBadge({ ...spec, id: idForBadge(rel) }));
  }
  return { files, unreadable };
}

// A pack's directory name is its id — the same structural derivation the pack
// registry makes, so a new badge cannot be titled with the wrong pack.
export const idForBadge = (rel) => basename(dirname(rel));

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'restyle') {
    const { files, unreadable } = restyleAll();
    for (const rel of unreadable) process.stderr.write(`! ${rel} is not a badge this tool can read — fix or delete it\n`);
    let changed = 0;
    for (const [rel, content] of files) {
      if (readFileSync(join(REPO, rel), 'utf8') === content) continue;
      writeFileSync(join(REPO, rel), content);
      process.stdout.write(`${rel}\n`);
      changed += 1;
    }
    process.stdout.write(`${changed} of ${files.size} badge(s) rewritten\n`);
    if (unreadable.length) process.exit(1);
  } else if (cmd === 'new') {
    const [rel, color, glyph] = rest;
    if (!rel || !color || !glyph) {
      process.stderr.write("usage: render.mjs new <packs/<pack>/badge.svg> <#rrggbb> <svg path 'd'>\n");
      process.exit(2);
    }
    writeFileSync(join(REPO, rel), renderBadge({ id: idForBadge(rel), color, glyph }));
    process.stdout.write(`${rel}\n`);
  } else {
    process.stderr.write('usage: render.mjs <restyle|new>\n');
    process.exit(2);
  }
}
