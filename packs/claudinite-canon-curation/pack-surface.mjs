// What a pack's `public/` folder actually publishes, and who outside the pack reads it.
//
// A published surface is a promise, and a promise nobody renders drifts: this pack's
// shelf carried a hand-written table of "modules other packs import" that named an
// export (`landPr`) no file has ever had, claimed a folder held only named exports
// while nine of its modules opened with `export *`, and listed a consumer for a module
// nothing imports. None of that was visible in a diff, because the table and the code
// it described were edited in different changes.
//
// So the table is derived instead. `renderSurfaceReport` is pure over a tree already
// read into memory, which keeps the scope assertion honest — a caller that hands it an
// empty file set gets an error rather than an empty report that reads as "no surface".
//
// A WILDCARD is reported as its own state, never expanded into a name list. `export *`
// republishes whatever its target exports today, so the surface it publishes is not a
// fact about this file at all; rendering the target's current names would state a
// promise the folder has not made.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// `export { a, b as c } from '…'` / `export { a, b }` — the named form, which is the
// only form that pins a surface. `as` matters: what the outside sees is the alias.
const RE_NAMED = /^export\s*\{([^}]*)\}/;
const RE_STAR = /^export\s*\*\s*(?:as\s+([\w$]+)\s+)?from\s*['"]([^'"]+)['"]/;
const RE_DECL = /^export\s+(?:async\s+)?(?:function\s*\*?\s*([\w$]+)|class\s+([\w$]+)|(?:const|let|var)\s+([\w$]+))/;

// An `import {`/`export {` list may wrap across lines, and the path it comes from sits
// on the LAST of them; fold each one back onto its opening line before matching, or a
// multi-line import reads as a module consumed for no names at all.
function logicalLines(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (/^\s*(?:import|export)\s*\{/.test(line) && !line.includes('}') && i + 1 < lines.length) line += ' ' + lines[++i].trim();
    out.push(line);
  }
  return out;
}

// The names one module publishes. `wildcards` are the `export * from` targets it
// opens with; a module carrying both a star and a list publishes MORE than its list,
// which is the case worth seeing in a report.
export function publishedNames(text) {
  const names = [];
  const wildcards = [];
  for (const line of logicalLines(text)) {
    let m;
    if ((m = line.match(RE_STAR))) {
      if (m[1]) names.push(m[1]);
      else wildcards.push(m[2]);
    } else if ((m = line.match(RE_DECL))) {
      names.push(m[1] || m[2] || m[3]);
    } else if ((m = line.match(RE_NAMED))) {
      for (const part of m[1].split(',')) {
        const n = part.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
        if (n) names.push(n[2] || n[1]);
      }
    }
  }
  return { names: [...new Set(names)].sort(), wildcards };
}

// Who a reference belongs to. The buckets are the ones that carry different weight:
// a member's workflow names a path this repo cannot rewrite, another pack's production
// code is a live dependency, and a test is only the canon proving its own contract.
//
// The mount prefix comes off first, so the pack reached through `.claudinite/shared/`
// is the same pack. Without that, a member running this over its own mount reads the
// pack's internals as an external consumer and every name they import counts as taken —
// the inflation this report exists to avoid, arriving from the one root that makes the
// pack look most in demand.
export function consumerBucket(path, packDir) {
  path = path.replace(/^\.claudinite\/(?:shared|local)\//, '');
  if (path.startsWith(`${packDir}/`)) return 'own pack';
  if (path.startsWith('.github/workflows/') || path.endsWith('.yml')) return 'workflow';
  const test = path.includes('/test/') || path.endsWith('.test.mjs');
  if (path.startsWith('packs/') || path.startsWith('.claudinite/')) return test ? 'pack (test)' : 'pack';
  return test ? 'canon (test)' : 'canon';
}

const BUCKET_ORDER = ['workflow', 'pack', 'pack (test)', 'canon', 'canon (test)', 'own pack'];

// How a line reaches the module. A comment or a remedy sentence naming a MODULE is a
// mention, not a dependency: it breaks nothing when the surface moves, and counting it
// as a reader overstates who the promise is being kept for — the one number this report
// exists to get right. A DOCUMENT is the opposite case: being named in prose is the
// only way one is ever consumed, so for a `.md` every reference is a reader.
//
// `node` decides a run only where a command is what the line holds — at its start, or
// after a workflow's `run:`. Mid-sentence inside a quoted remedy it is prose describing
// a command, not one.
function reachOf(line, isDocument) {
  const braces = line.match(/(?:import|export)\s*\{([^}]*)\}\s*from/) || line.match(/\{([^}]*)\}\s*=\s*await\s+import/);
  if (braces) return { kind: 'import', names: braces[1].split(',').map((p) => p.trim().match(/^([\w$]+)/)?.[1]).filter(Boolean) };
  if (/(?:^|\s)(?:import|export)\s[^{]*from\s*['"]/.test(line) || /\bimport\s*\(/.test(line)) return { kind: 'import', names: [] };
  if (isDocument) return { kind: 'names', names: [] };
  if (/^\s*(?:\/\/|\*|#|\|)/.test(line)) return { kind: 'mention', names: [] };
  if (/(?:^\s*|\brun:\s*)node\s/.test(line)) return { kind: 'run', names: [] };
  return { kind: 'mention', names: [] };
}

// Every reference to `<packDir>/public/<file>` anywhere in the tree, however the
// referring file spells the path: a member spells it under the mount, a sibling pack
// spells it relative. Matching on the tail is what makes one scan cover all three.
export function readSurfaceUse({ files, packDir }) {
  const pack = packDir.split('/').pop();
  const modules = new Map();
  for (const [path, text] of files) {
    if (!path.startsWith(`${packDir}/public/`)) continue;
    const name = path.slice(`${packDir}/public/`.length);
    if (name.includes('/')) continue;
    modules.set(name, { name, consumers: new Map(), mentions: new Set(), used: new Set(), ...(name.endsWith('.mjs') ? publishedNames(text) : { names: [], wildcards: [] }) });
  }
  if (!modules.size) throw new Error(`no public/ modules found under ${packDir} — the report would be silently empty`);

  const ref = new RegExp(`(?:${pack}/public/|(?:\\.\\./)+public/)([\\w.-]+)`, 'g');
  for (const [path, text] of files) {
    for (const line of logicalLines(text)) {
      for (const m of line.matchAll(ref)) {
        const mod = modules.get(m[1]);
        if (!mod) continue;
        const bucket = consumerBucket(path, packDir);
        const reach = reachOf(line, !mod.name.endsWith('.mjs'));
        if (bucket === 'own pack') continue;
        if (reach.kind === 'mention') { mod.mentions.add(path); continue; }
        (mod.consumers.get(bucket) ?? mod.consumers.set(bucket, new Set()).get(bucket)).add(path);
        // Only a name the module actually publishes counts as taken, so the columns
        // add up: a name nothing exports is a consumer's own bug, not this surface.
        for (const n of reach.names) if (mod.names.includes(n)) mod.used.add(n);
      }
    }
  }
  return modules;
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

// A consumer list is a summary surface: the packs, not the files, since the file count
// tracks how a consumer happens to be split up rather than how much it depends.
function consumerCell({ consumers, mentions }) {
  const parts = [];
  for (const bucket of BUCKET_ORDER) {
    const paths = consumers.get(bucket);
    if (!paths) continue;
    const who = [...new Set([...paths].map((p) => p.startsWith('packs/') ? p.split('/')[1] : p.split('/')[0] || p))].sort();
    parts.push(`${bucket}: ${who.join(', ')}`);
  }
  if (!parts.length) parts.push('**nobody**');
  if (mentions.size) parts.push(`${mentions.size} prose mention${mentions.size === 1 ? '' : 's'}`);
  return parts.join('; ');
}

export function renderSurfaceReport({ packDir, files }) {
  const modules = [...readSurfaceUse({ files, packDir }).values()].sort((a, b) => a.name.localeCompare(b.name));
  const mjs = modules.filter((m) => m.name.endsWith('.mjs'));
  const docs = modules.filter((m) => !m.name.endsWith('.mjs'));

  const rows = mjs.map((m) => {
    const published = m.wildcards.length
      ? `${m.names.length} named + \`export *\` from ${m.wildcards.map((w) => `\`${w}\``).join(', ')}`
      : String(m.names.length);
    const unread = m.names.filter((n) => !m.used.has(n));
    return `| \`${m.name}\` | ${published} | ${m.used.size || '—'} | ${unread.length ? unread.map((n) => `\`${n}\``).join(', ') : '—'} | ${cell(consumerCell(m))} |`;
  });

  const docRows = docs.map((m) => `| \`${m.name}\` | ${cell(consumerCell(m))} |`);
  const starred = mjs.filter((m) => m.wildcards.length);

  return `# \`${packDir}/public/\` — the published surface

GENERATED — do not hand-edit. Rendered from the tracked tree by the canon's
\`packs/claudinite-canon-curation/test/pack-surface.test.mjs\`; regenerate by running that
test in a canon checkout.

What this folder publishes, and who outside the pack reads it. **Read for surface
GROWTH**: a name appearing here that nothing outside the pack takes is surface the pack
is promising to keep without being asked to, and a row whose consumers are only tests is
a contract the canon holds with itself.

Counts are per module. *Published* is what the file exports; *taken* is how many distinct
names anything outside the pack actually imports — a workflow that runs a module with
\`node\` reads the file and takes no name, so an entry-point module reads \`—\`. A path named
only in a comment or a remedy's prose is a **mention**, counted apart: it depends on
nothing and breaks nothing when the surface moves.

| Module | Published | Taken | Published, taken by nobody | Who reads it |
|---|---|---|---|---|
${rows.join('\n')}

## Documents

| Document | Who reads it |
|---|---|
${docRows.join('\n')}
${starred.length ? `
## Wildcards — surface not pinned

${starred.length} module${starred.length === 1 ? '' : 's'} re-export${starred.length === 1 ? 's' : ''} with \`export *\`, so what ${starred.length === 1 ? 'it publishes' : 'they publish'} is whatever the
target exports at the time — an internal rename widens or narrows the promise with no
edit here and no diff in this report's name counts.

${starred.map((m) => `- \`${m.name}\` → ${m.wildcards.map((w) => `\`${w}\``).join(', ')}`).join('\n')}
` : ''}`;
}

// --- on demand ---------------------------------------------------------------------
// `node packs/claudinite-canon-curation/pack-surface.mjs packs/claudinite-tasks` prints the
// report for that pack over the working tree. Never committed: a surface report is read
// when a surface is being changed, and a committed copy is stale the moment it is not.
function treeText(root, dir = root, files = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.claudinite-cache'].includes(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) { treeText(root, abs, files); continue; }
    if (!entry.isFile() || !/\.(mjs|js|json|md|yml|yaml)$/.test(entry.name)) continue;
    files.set(relative(root, abs).split(sep).join('/'), readFileSync(abs, 'utf8'));
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const packDir = process.argv[2];
  if (!packDir) {
    console.error('usage: node pack-surface.mjs <packs/<pack>>');
    process.exitCode = 2;
  } else {
    process.stdout.write(renderSurfaceReport({ packDir, files: treeText(process.cwd()) }));
  }
}
