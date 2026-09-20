#!/usr/bin/env node
// The provenance log's one tool (the provenance design, #2136): every flow that
// creates or changes an element appends through it, the marking pass runs through it,
// and a maintainer checks a pack with it. Two roots — a canon's `packs/<id>` and a
// member's `.claudinite/local/packs/<id>` — resolved from the id, or `--all` for every
// pack under both. The grammar and the codemods are the engine helper's
// (engine/checks/helpers/provenance.mjs); this is the command line over them, and
// the parts that need git or a scrub.
//
//   node <path-to-this-file> mark <pack>|--all [--dry-run]
//   node <path-to-this-file> check <pack>|--all
//   node <path-to-this-file> convert-references <pack>|--all
//   node <path-to-this-file> append <pack> <element> [--kind <kind>] [--date <YYYY-MM-DD>] [--changed] < entry.md
//   node <path-to-this-file> reduce <file> [--public]
//   node <path-to-this-file> history <pack> <element>
//
// In a member the path is .claudinite/shared/packs/claudinite-growth/provenance.mjs; in
// the canon, packs/claudinite-growth/provenance.mjs. The append reads one entry in the
// file grammar from stdin — `## <date> · <kind> · <title>` and its `- **Field:** …`
// lines — and refuses one that carries a secret, since a decision log is prose an
// agent writes and the one place nothing else scans.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// A namespace import, guarded in `main`: the pack and engine lanes deliver on separate
// cadences, and a mount whose engine predates the helper must say so rather than fault
// on a missing named export.
import * as provenance from '../../engine/checks/helpers/provenance.mjs';
import { scrub } from './capture-log.mjs';

const {
  checkoutIo, auditPack, markPack, convertReferences, appendedText, parseEntryText, packCarriers,
  provenanceFiles, reduceFile, fileOfId, elementIdOf,
  PACK_ROOTS, PROVENANCE_DIR, DECLINED_FILE, DECLINED_KIND, PACK_ELEMENT,
} = provenance;

const USAGE = `usage: provenance.mjs <command> …
  mark <pack>|--all [--dry-run]          markers, bodies and empty files for every carrier
  check <pack>|--all                     what each file is named by, and every fault
  convert-references <pack>|--all        the references.md of a pack into its elements' files
  append <pack> <element> [--kind K] [--date D] [--changed] < entry.md
  reduce <file> [--public]               the promotion reduction, to stdout
  history <pack> <element>               the backfill brief from git, VERSIONS.md and the README`;

// --- packs and roots ---------------------------------------------------------------

export function resolvePack(root, id, io = checkoutIo(root)) {
  if (id.includes('/')) return io.exists(`${id}/pack.mjs`) ? id.replace(/\/+$/, '') : null;
  for (const r of PACK_ROOTS) if (io.exists(`${r}/${id}/pack.mjs`)) return `${r}/${id}`;
  return null;
}

export function allPacks(io) {
  const out = [];
  for (const r of PACK_ROOTS) for (const name of (io.listDir(r) ?? []).sort()) if (io.exists(`${r}/${name}/pack.mjs`)) out.push(`${r}/${name}`);
  return out;
}

// A copy-on-write io over another: what `--dry-run` runs the codemods against, so the
// report is the real one and the tree is untouched.
export function overlayIo(base) {
  const written = new Map();
  const removed = new Set();
  const listDir = (p) => {
    if (written.has(p)) return null;
    const names = new Set((removed.has(p) ? null : base.listDir(p)) ?? []);
    let any = names.size > 0 || base.listDir(p) !== null;
    for (const w of written.keys()) {
      if (w.startsWith(`${p}/`)) { names.add(w.slice(p.length + 1).split('/')[0]); any = true; }
    }
    for (const r of removed) names.delete(r.slice(p.length + 1));
    return any ? [...names] : null;
  };
  return {
    exists: (p) => (removed.has(p) ? false : written.has(p) || base.exists(p)),
    read: (p) => (removed.has(p) ? null : written.has(p) ? written.get(p) : base.read(p)),
    write: (p, t) => { written.set(p, t); removed.delete(p); },
    remove: (p) => { removed.add(p); written.delete(p); },
    listDir,
  };
}

const git = (root, ...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };

// --- the commands ------------------------------------------------------------------

export function mark(root, packs, { dryRun = false } = {}) {
  const real = checkoutIo(root);
  const io = dryRun ? overlayIo(real) : real;
  const lines = [];
  let empty = 0;
  for (const pack of packs) {
    lines.push(...markPack(pack, io));
    empty += auditPack(pack, io).empty.length;
  }
  lines.push(`${empty} empty provenance file${empty === 1 ? '' : 's'} under ${packs.length === 1 ? packs[0] : `${packs.length} packs`}${dryRun ? ' (dry run: nothing written)' : ''}`);
  return { lines, empty };
}

// The audit as text: what each file is named by, then every fault. Exit status is the
// caller's: faults are anything but pending history.
export function check(root, packs) {
  const io = checkoutIo(root);
  const lines = [];
  let faults = 0;
  for (const pack of packs) {
    const a = auditPack(pack, io);
    const namedBy = new Map();
    const name = (id, by) => { if (!namedBy.has(id)) namedBy.set(id, []); namedBy.get(id).push(by); };
    for (const r of a.carriers.rules) if (r.slug) name(r.slug, `rule "${r.trigger}"`);
    for (const g of a.carriers.guidelines) if (g.slug) name(g.slug, `guideline "${g.trigger}" (${g.skill})`);
    for (const s of a.carriers.skills) if (s.present) name(s.name, `skill ${s.name} (${s.body ?? 'no body'})`);
    for (const c of a.carriers.checks) name(elementIdOf(c.id), `check ${c.id}`);
    for (const t of a.carriers.tasks) name(t.id, `task ${t.id}`);
    if (a.carriers.manifest) name(PACK_ELEMENT, 'the manifest');
    lines.push(`${pack}/${PROVENANCE_DIR}/`);
    for (const [id, f] of [...a.files].sort()) lines.push(`  ${fileOfId(id)} ← ${(namedBy.get(id) ?? ['nothing']).join(', ')}${f.status === 'retired' ? ' (retired)' : f.empty ? ' (empty)' : ''}`);
    const fault = (file, line, what) => { faults++; lines.push(`  ${file}${line ? `:${line}` : ''}: ${what}`); };
    for (const u of a.unmarked) fault(u.file, u.line, `"${u.trigger}" ends with no marker`);
    for (const d of a.dangling) fault(d.file, d.line, `${d.carrier} names ${fileOfId(d.id)}, which is ${d.retired ? 'retired' : 'no file'}`);
    for (const u of a.unnamed) fault(u.file, null, 'live, and named by no carrier');
    for (const n of a.noBody) fault(n.file, null, `skill ${n.skill} declares no body`);
    for (const m of a.markerInWorkflow) fault(m.file, m.line, `"${m.trigger}" carries a marker inside a workflow skill`);
    for (const e of a.parseErrors) fault(e.file, e.line, e.what);
    for (const e of a.entryFaults) fault(e.file, e.line, e.what);
    if (a.referencesDoc) fault(a.referencesDoc, null, 'a references.md still exists — convert-references retires it');
  }
  return { lines, faults };
}

// The earliest commit that added a references key, as a YYYY-MM-DD date — what dates
// a converted entry where git is there to read.
export function referenceDateOf(root, doc) {
  return (key) => {
    const out = git(root, 'log', '--reverse', '--format=%as', `-S**(${key})**`, '--', doc).trim().split('\n')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(out ?? '') ? out : null;
  };
}

export function convert(root, packs) {
  const io = checkoutIo(root);
  const lines = [];
  for (const pack of packs) lines.push(...convertReferences(pack, io, { dateOf: referenceDateOf(root, `${pack}/references.md`) }));
  return lines;
}

// The elements the working tree's change touched, for `append --changed`: a rule whose
// normalized text differs from HEAD's, a check module, a task or the manifest that
// changed, a skill whose file changed (its guidelines by text).
export function changedElements(root, pack) {
  const io = checkoutIo(root);
  const changed = new Set([...git(root, 'diff', '--name-only', 'HEAD', '--', pack).split('\n'), ...git(root, 'ls-files', '--others', '--exclude-standard', '--', pack).split('\n')].filter(Boolean));
  const head = { ...io, read: (p) => { const t = git(root, 'show', `HEAD:${p}`); return t === '' && !git(root, 'cat-file', '-e', `HEAD:${p}`) ? null : t; } };
  const out = new Set();
  const now = packCarriers(pack, io);
  const before = packCarriers(pack, head);
  const byTrigger = (list) => new Map(list.map((r) => [r.trigger, r]));
  const prose = (nowList, thenList) => {
    const then = byTrigger(thenList);
    for (const r of nowList) {
      if (!r.slug || !changed.has(r.file)) continue;
      const was = then.get(r.trigger);
      if (!was || was.text !== r.text) out.add(r.slug);
    }
  };
  prose(now.rules, before.rules);
  prose(now.guidelines, before.guidelines);
  for (const s of now.skills) if (s.present && changed.has(s.file)) out.add(s.name);
  for (const c of now.checks) if (changed.has(c.file)) out.add(elementIdOf(c.id));
  for (const t of now.tasks) if ([...changed].some((f) => f.startsWith(`${t.dir}/`))) out.add(t.id);
  if (now.manifest && changed.has(`${pack}/pack.mjs`)) out.add(PACK_ELEMENT);
  return [...out].sort();
}

export function append(root, pack, elements, entryText, { kind = null, date = null } = {}) {
  const io = checkoutIo(root);
  const scrubbed = scrub(entryText);
  if (scrubbed !== entryText) return { problems: ['the entry carries what reads as a secret; a decision log is the one place nothing else scans, so it is refused whole'] };
  const parsed = parseEntryText(entryText);
  if (parsed.problems.length) return { problems: parsed.problems };
  const entry = { ...parsed.entry, ...(kind ? { kind } : {}), ...(date ? { date } : {}) };
  const written = [];
  for (const element of elements) {
    const declined = element === DECLINED_KIND || element === '_declined';
    const file = `${pack}/${PROVENANCE_DIR}/${declined ? DECLINED_FILE : fileOfId(element)}`;
    if (!declined && !io.exists(file)) return { problems: [`${file} does not exist — no carrier of ${pack} names an element "${element}" (run mark, or check the id)`] };
    const result = appendedText(io.read(file) ?? '', entry, declined ? { kinds: [DECLINED_KIND], firstKind: null } : {});
    if (result.problems.length) return { problems: result.problems.map((p) => `${file}: ${p}`) };
    io.write(file, result.text);
    written.push(file);
  }
  return { problems: [], written };
}

// The backfill brief: the carrier's commits through every rename, a pickaxe on the
// rule's lead-in, the pull requests those commits name, the VERSIONS.md rows naming
// them, and the README's history sentences. Tracker comments live on GitHub and are
// the session's to read.
export function history(root, pack, element) {
  const io = checkoutIo(root);
  const c = packCarriers(pack, io);
  const files = new Set();
  const triggers = [];
  for (const r of [...c.rules, ...c.guidelines]) if (r.slug === element) { files.add(r.file); triggers.push(r.trigger); }
  for (const s of c.skills) if (s.name === element) files.add(s.file);
  for (const x of c.checks) if (elementIdOf(x.id) === element) files.add(x.file);
  for (const t of c.tasks) if (t.id === element) files.add(t.dir);
  if (element === PACK_ELEMENT) files.add(`${pack}/pack.mjs`);
  const lines = [`# ${pack} · ${element}`];
  if (!files.size) { lines.push('named by no carrier of this pack'); return lines; }
  const prs = new Set();
  const note = (commits) => { for (const m of commits.matchAll(/\(#(\d+)\)/g)) prs.add(m[1]); };
  for (const f of files) {
    lines.push(`\n## commits touching ${f}`);
    const log = git(root, 'log', '--follow', '--format=%h %as %s', '--', f);
    lines.push(log.trim() || '(none — is the clone shallow?)');
    note(log);
  }
  for (const t of triggers) {
    lines.push(`\n## commits adding or removing "${t}"`);
    const log = git(root, 'log', '--format=%h %as %s', `-S${t}`, '--', pack);
    lines.push(log.trim() || '(none)');
    note(log);
  }
  lines.push('\n## pull requests those commits name');
  lines.push(prs.size ? [...prs].sort((a, b) => a - b).map((n) => `#${n}`).join(' ') : '(none)');
  const versions = io.read(`${pack}/VERSIONS.md`);
  if (versions) {
    lines.push('\n## VERSIONS.md rows naming them');
    const rows = versions.split('\n').filter((l) => l.startsWith('|') && [...prs].some((n) => l.includes(`#${n}`)));
    lines.push(rows.join('\n') || '(none)');
  }
  const readme = io.read(`${pack}/README.md`);
  if (readme) {
    lines.push('\n## README sentences that read as history');
    const tells = readme.split(/(?<=[.!?])\s+/).filter((s) => /#\d+|\buntil\b|\bdistilled from\b|\bkept as\b|\breplaced\b|\babsorbed\b|\b20\d\d-\d\d-\d\d\b/.test(s) || triggers.some((t) => s.includes(t)));
    lines.push(tells.map((s) => `- ${s.replace(/\s+/g, ' ').trim()}`).join('\n') || '(none)');
  }
  lines.push('\n## tracker comments');
  lines.push('read the promote tracker and the extract issues on GitHub; git does not hold them');
  return lines;
}

// --- main ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2), { root = process.env.CLAUDE_PROJECT_DIR || process.cwd(), stdin = null } = {}) {
  if (typeof provenance.auditPack !== 'function') {
    console.error('this engine predates the provenance helper — converge the mount first');
    return 2;
  }
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--') && !['--kind', '--date'].includes(a)));
  const valueOf = (flag) => { const i = rest.indexOf(flag); return i === -1 ? null : rest[i + 1]; };
  const positional = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--kind' && rest[i - 1] !== '--date');
  const io = checkoutIo(root);
  const packsFor = (id) => {
    if (flags.has('--all')) return allPacks(io);
    const dir = id && resolvePack(root, id, io);
    if (!dir) { console.error(`no pack "${id ?? ''}" under ${PACK_ROOTS.join(' or ')}`); return null; }
    return [dir];
  };
  switch (command) {
    case 'mark': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const { lines } = mark(root, packs, { dryRun: flags.has('--dry-run') });
      console.log(lines.join('\n'));
      return 0;
    }
    case 'check': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const { lines, faults } = check(root, packs);
      console.log(lines.join('\n'));
      return faults ? 1 : 0;
    }
    case 'convert-references': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const lines = convert(root, packs);
      console.log(lines.join('\n') || 'no references.md to convert');
      return 0;
    }
    case 'append': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const pack = packs[0];
      const elements = flags.has('--changed') ? changedElements(root, pack) : positional.slice(1, 2);
      if (!elements.length) { console.error(flags.has('--changed') ? 'the working tree changed no carrier of this pack' : 'append needs an element id'); return 2; }
      const text = stdin ?? readFileSync(0, 'utf8');
      const { problems, written } = append(root, pack, elements, text, { kind: valueOf('--kind'), date: valueOf('--date') });
      if (problems.length) { console.error(problems.join('\n')); return 1; }
      console.log(written.map((f) => `${f}: appended`).join('\n'));
      return 0;
    }
    case 'reduce': {
      const file = positional[0];
      if (!file || !io.exists(file)) { console.error('reduce needs a file'); return 2; }
      process.stdout.write(reduceFile(io.read(file), { publicCanon: flags.has('--public') }));
      return 0;
    }
    case 'history': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      if (!positional[1]) { console.error('history needs an element id'); return 2; }
      console.log(history(root, packs[0], positional[1]).join('\n'));
      return 0;
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((e) => { console.error(`provenance: ${e.message}`); process.exitCode = 1; });
}
