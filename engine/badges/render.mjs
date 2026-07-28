import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPacks, resolveDeclaredPacks, packEntryId } from '../pack_loader/pack-registry.mjs';

// Pack badges — the small square mark a pack carries so a consuming repo's
// README can show, at a glance, which Claudinite packs it runs.
//
// A pack declares its own badge on its manifest (`badge: { file, color, glyph }`),
// exactly like every other slot it contributes: the FILE PATH is the pack's to
// name, the artwork is the pack's to own, and this module knows only how to turn
// that declaration into SVG. Nothing here names a pack — the badge set is
// whatever the registry discovers, so a new pack ships its mark with no edit to
// the engine (and none to a hand-maintained badge list, which would be the same
// drift trap packs/README.md needs a check to survive).
//
// The rendered files are checked in — a README on GitHub loads an image over
// HTTP, so the artwork has to exist as a file, and a pack's badge rides its
// directory into every consumer's vendor set the same way its prose and skills
// do. They carry a GENERATED banner in the file itself rather than in the
// filename: the path is a published URL a consumer pastes into its README, and
// `badge.GENERATED.svg` would leak our build convention into every one of those.
// engine-tests/badges/render.test.mjs is the drift guard the naming convention
// otherwise buys — it re-renders every badge and fails when a tracked file and
// its manifest disagree.

// This module lives at <canon>/engine/badges/.
const canonRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// The tile. 32px is the size a README row wants — big enough for a glyph to
// read, small enough that a row of them costs one line of vertical space — and
// the artwork is SVG, so the number fixes the layout, never the fidelity.
export const BADGE_SIZE = 32;
const CORNER = 8;
const STROKE = 2.2;

// The strip's gap between tiles. Chosen against the tile, not the page: a
// quarter-tile reads as "a set" without the marks running together.
const STRIP_GAP = 8;

// The glyph ink. One value, deliberately: a badge is a saturated tile with white
// line art on it, so it reads the same against a light or a dark README.
const INK = '#ffffff';

const HEX = /^#[0-9a-fA-F]{6}$/;

// A flat tile reads as a sticker; a hair of vertical shade reads as a mark. The
// bottom stop is the declared color darkened — derived, so a pack declares one
// color and can't half-update a pair.
function shade(hex, amount) {
  const ch = (i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(Math.max(0, Math.min(255, v * (1 + amount))));
  };
  return `#${[0, 1, 2].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`;
}

// A pack's badge declaration, validated. Returns { spec, errors }: `spec` is null
// when the declaration is missing or malformed, so a caller renders nothing
// rather than a wrong mark. Every field is required — a default color or a
// fallback glyph would put a pack's identity in the engine, where the pack could
// never see it to change it.
export function packBadge(pack) {
  const errors = [];
  const at = `the "${pack.id}" pack`;
  const badge = pack.badge;
  if (badge === undefined || badge === null) {
    errors.push({ what: `${at} declares no "badge"`, fix: 'add badge: { file, color, glyph } to its pack.mjs' });
    return { spec: null, errors };
  }
  if (typeof badge !== 'object' || Array.isArray(badge)) {
    errors.push({ what: `${at} declares a non-object "badge"`, fix: 'shape it as badge: { file, color, glyph }' });
    return { spec: null, errors };
  }
  const { file, color, glyph } = badge;
  if (typeof file !== 'string' || !file.trim() || file.includes('..') || file.startsWith('/')) {
    errors.push({ what: `${at} declares a badge with no usable "file"`, fix: 'name the file relative to the pack directory, e.g. file: "badge.svg"' });
  }
  if (typeof color !== 'string' || !HEX.test(color)) {
    errors.push({ what: `${at} declares a badge "color" that is not a #rrggbb hex`, fix: 'use a six-digit hex, e.g. color: "#4f46e5"' });
  }
  if (typeof glyph !== 'string' || !glyph.trim()) {
    errors.push({ what: `${at} declares a badge with no "glyph"`, fix: 'give glyph an SVG path "d" string — it is stroked, not filled' });
  }
  if (errors.length) return { spec: null, errors };
  return { spec: { id: pack.id, dir: pack.dir, local: pack.local, file, color, glyph }, errors };
}

// Where a spec's badge file and its declaring manifest sit, as repo-relative
// posix paths. Derived from the pack's own `dir` (the registry stamps it), so
// canon and local packs answer through one path and neither tree is named here.
const rel = (root, p) => relative(root, p).split('\\').join('/');
export const badgePath = (spec, root) => rel(root, join(spec.dir, spec.file));
export const manifestPath = (spec, root) => rel(root, join(spec.dir, 'pack.mjs'));

// Every discovered pack's badge spec, in registry order, plus the load/validation
// faults. `localRoot` includes a repo's own packs (they declare a badge like any
// other pack — a local pack is a pack).
export async function packBadges(opts) {
  const specs = [];
  const errors = [];
  for (const pack of await loadPacks(opts)) {
    const { spec, errors: bad } = packBadge(pack);
    errors.push(...bad);
    if (spec) specs.push(spec);
  }
  return { specs, errors };
}

// The badge specs a repo's declaration activates, in declaration order (the
// `requires` closure included, so a pack pulled in as a prerequisite shows up
// exactly as it does in the file). Ids naming no discovered pack are skipped —
// settings validation is the runner's job, not the renderer's.
export async function declaredBadges(declaredEntries, opts) {
  const { specs, errors } = await packBadges(opts);
  const byId = new Map(specs.map((s) => [s.id, s]));
  const packs = await loadPacks(opts);
  const out = [];
  for (const entry of resolveDeclaredPacks(declaredEntries ?? [], packs)) {
    const id = packEntryId(entry);
    const spec = id === undefined ? undefined : byId.get(id);
    if (spec && !out.includes(spec)) out.push(spec);
  }
  return { specs: out, errors };
}

const BANNER = (source) => `<!-- GENERATED by engine/badges/render.mjs from ${source} — do not edit by hand -->`;

// A tile's fill, and the tile itself at an offset — the markup both the
// standalone badge and the strip place. The gradient id is namespaced by pack
// id, or a strip's second tile would paint with the first tile's fill.
const gid = (id) => `b-${id}`;

function gradient({ id, color }) {
  return [
    `    <linearGradient id="${gid(id)}" x1="0" y1="0" x2="0" y2="1">`,
    `      <stop offset="0" stop-color="${color}"/>`,
    `      <stop offset="1" stop-color="${shade(color, -0.22)}"/>`,
    '    </linearGradient>',
  ].join('\n');
}

function tile({ id, glyph }, x) {
  const at = x ? ` transform="translate(${x} 0)"` : '';
  return [
    `  <g${at}>`,
    `    <rect width="${BADGE_SIZE}" height="${BADGE_SIZE}" rx="${CORNER}" fill="url(#${gid(id)})"/>`,
    `    <path d="${glyph}" fill="none" stroke="${INK}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`,
    '  </g>',
  ].join('\n');
}

// A pack's own badge file: one tile, sized to itself.
export function badgeSvg(spec, { source }) {
  return [
    BANNER(source),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BADGE_SIZE} ${BADGE_SIZE}" width="${BADGE_SIZE}" height="${BADGE_SIZE}" role="img" aria-label="Claudinite pack: ${spec.id}">`,
    `  <title>${spec.id}</title>`,
    '  <defs>',
    gradient(spec),
    '  </defs>',
    tile(spec, 0),
    '</svg>',
    '',
  ].join('\n');
}

// The usage strip: a repo's active packs as one image, so a README shows the set
// in a single row and one reference. One image rather than one per pack is what
// keeps this repo's own README honest, too — core must not name the packs it
// runs, and a strip rendered from the declaration names none of them in prose.
export function stripSvg(specs, { source }) {
  const step = BADGE_SIZE + STRIP_GAP;
  const width = specs.length ? specs.length * step - STRIP_GAP : 0;
  return [
    BANNER(source),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${BADGE_SIZE}" width="${width}" height="${BADGE_SIZE}" role="img" aria-label="Claudinite packs in use: ${specs.map((s) => s.id).join(', ')}">`,
    `  <title>Claudinite packs in use: ${specs.map((s) => s.id).join(', ')}</title>`,
    '  <defs>',
    ...specs.map(gradient),
    '  </defs>',
    ...specs.map((s, i) => tile(s, i * step)),
    '</svg>',
    '',
  ].join('\n');
}

// Everything a checkout should contain, as canon-relative path → content: every
// discovered pack's badge file, plus the strip for this repo's own declaration.
// One function so the writer and the drift guard render from the same call and
// cannot disagree about what "current" means.
export async function renderAll({ root = canonRoot, stripPath, declared } = {}) {
  const { specs, errors } = await packBadges({ localRoot: root });
  const files = new Map();
  for (const spec of specs) {
    files.set(badgePath(spec, root), badgeSvg(spec, { source: manifestPath(spec, root) }));
  }
  if (stripPath) {
    const { specs: active } = await declaredBadges(declared, { localRoot: root });
    files.set(stripPath, stripSvg(active, { source: '.claudinite-checks.json' }));
  }
  return { files, errors };
}

// CLI — but importable (the drift guard imports the renderers above).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const stripPath = process.argv[2];
  if (!stripPath) {
    process.stderr.write('usage: render.mjs <strip-output-path>\n');
    process.exit(2);
  }
  const declared = JSON.parse(readFileSync(join(canonRoot, '.claudinite-checks.json'), 'utf8')).packs;
  const { files, errors } = await renderAll({ stripPath, declared });
  for (const e of errors) process.stderr.write(`! ${e.what} — ${e.fix}\n`);
  for (const [rel, content] of files) {
    writeFileSync(join(canonRoot, rel), content);
    process.stdout.write(`${rel}\n`);
  }
  if (errors.length) process.exit(1);
}
