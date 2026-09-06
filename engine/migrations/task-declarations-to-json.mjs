#!/usr/bin/env node
// Convert task declarations from the retired module form (`tasks/<name>/task.mjs`,
// a default-exported object literal) to the data form (`task.json`, pointing at
// the task schema through `$schema`), deleting the module once its JSON exists.
//
// Two callers. The `task-declarations-json` migration record runs this against a
// member's OWN local packs on its nightly update, through the registry's io
// capabilities, so a member converts without anyone remembering to; and the CLI
// below converts a checkout by hand — the canon's own packs, or a member that
// wants it done sooner:
//
//   node engine/migrations/task-declarations-to-json.mjs [--root <repo>] [<task dir>…]
//
// The module's comments cannot survive in the JSON, so they move to the task's
// `README.md`, under one heading, verbatim — mostly they restated the assignment
// beside them, but what was rationale is then still where a reader of the task
// looks, and the update's apply stage reads it to write the task's `description`.
// The conversion prints each block too. A field that is not data (the retired
// `precondition()` function) is dropped, and named in the report line: the
// contract rejects it either way.
//
// Beside the conversion, the second rewrite of the same files: the retired
// `frequency` field (tasks-dispatch DESIGN §5, #1725) folded into `preconditions`
// as the cadence term it always meant. Patched as ANCHORED TEXT, never re-serialized —
// a member's task.json is its author's, and a round-trip would rewrite its layout
// while nothing failed. The `task-cadence-terms` record runs it nightly; the CLI
// runs it after the conversion.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TASK_JSON = 'task.json';
export const TASK_MJS = 'task.mjs';

// The schema every converted file points at, in the two-root form: a member reads
// it out of its mount, the canon out of its own tree.
export const SCHEMA_FILE = 'packs/claudinite-tasks/task.schema.json';
export const schemaPath = (exists) => (exists(`.claudinite/shared/${SCHEMA_FILE}`) ? `.claudinite/shared/${SCHEMA_FILE}` : SCHEMA_FILE);

// The pack roots a checkout's tasks live under. A member's own are the local
// packs; the canon also carries the shared packs at the repo root.
export const LOCAL_PACK_ROOT = '.claudinite/local/packs';
export const CANON_PACK_ROOT = 'packs';

// The order a declaration's keys are written in, grouped by what they say: what
// the task is, when it runs, what it may write, then the two phases — code work,
// then the agent. A key not listed keeps its place after the listed ones.
export const KEY_ORDER = [
  '$schema', 'id', 'description',
  'schedule_after', 'trigger', 'preconditions',
  'expected_outcome', 'automerge', 'on_interrupt', 'invocation_endpoint',
  'code_work', 'code_work_timeout', 'code_work_required_secrets',
  'agent_model', 'model_from_request', 'agent_instructions', 'agent_execution_timeout',
];
export function orderTaskKeys(decl) {
  const rank = (k) => { const i = KEY_ORDER.indexOf(k); return i === -1 ? KEY_ORDER.length : i; };
  return Object.fromEntries(Object.entries(decl).sort(([a], [b]) => rank(a) - rank(b)));
}

// The JSON text for a declaration object, keys in KEY_ORDER. Returns the keys
// that could not be carried (functions, undefined) so the caller can say so.
export function serializeTaskDeclaration(decl, schemaRelative) {
  const dropped = Object.keys(decl).filter((k) => typeof decl[k] === 'function' || decl[k] === undefined);
  // An empty expression is spelled by absence: a task requiring nothing states no
  // conditions. Whether anything asks it is `trigger`, which is written either way.
  const data = Object.fromEntries(Object.entries(decl)
    .filter(([k, v]) => !dropped.includes(k) && !(k === 'preconditions' && Array.isArray(v) && v.length === 0)));
  return { text: `${JSON.stringify(orderTaskKeys({ $schema: schemaRelative, ...data }), null, 2)}\n`, dropped };
}

// The comment lines a module carried, for the report: everything outside the
// object literal, so a header explaining why the task exists is not lost silently.
export function moduleComments(source) {
  const out = [];
  for (const line of source.split('\n')) {
    const whole = /^\s*(\/\/|\/\*|\*\/|\*)\s?(.*)$/.exec(line);
    if (whole) { out.push(whole[2]); continue; }
    // A trailing `// …` on a field line — the value's own note. A `//` inside a
    // string value (a URL) is not one; the field's quote closes before the marker.
    const trailing = /^[^'"]*(?:'[^']*'|"[^"]*")?[^'"]*?\s\/\/\s?(.*)$/.exec(line);
    if (trailing) out.push(trailing[1]);
  }
  return out.join('\n').trim();
}

// Every `<root>/<pack>/tasks/<task>/` directory under the given pack roots that
// carries a task.mjs, repo-relative and posix. `listDir(p)` returns the entry
// names of a directory, or null when it is not one.
export function taskDirsWithModule(packRoots, { listDir, exists }) {
  const out = [];
  for (const root of packRoots) {
    for (const pack of listDir(root) ?? []) {
      const tasks = `${root}/${pack}/tasks`;
      for (const task of listDir(tasks) ?? []) {
        const dir = `${tasks}/${task}`;
        if (exists(`${dir}/${TASK_MJS}`)) out.push(dir);
      }
    }
  }
  return out.sort();
}

// The section a task's README gains for its module's comments.
export const NOTES_HEADING = '## Why the declaration reads as it does';
export function readmeWithNotes(existing, id, comments) {
  const section = `\n${NOTES_HEADING}\n\nCarried over from the declaration's comments when it became ${TASK_JSON}.\n\n${comments}\n`;
  return `${existing ? `${existing.replace(/\n*$/, '\n')}` : `# ${id}\n`}${section}`;
}

// The conversion deletes the module, so any sibling that imported it would stop
// resolving — and a task whose worker cannot load parks its lane rather than
// running degraded. Rewrite the import in place, preserving the quote style, and
// carry the JSON import attribute the runtime requires.
export const rewriteTaskImport = (text) => text.replace(
  /(\bfrom\s*)(['"])\.\/task\.mjs\2/g,
  (_m, from, q) => `${from}${q}./task.json${q} with { type: ${q}json${q} }`,
);

// Every sibling .mjs in the task folder, except the module being converted.
export function rewriteTaskImporters(dir, io) {
  const rewritten = [];
  for (const name of io.listDir(dir) ?? []) {
    if (!name.endsWith('.mjs') || name === TASK_MJS) continue;
    const at = `${dir}/${name}`;
    const before = io.read(at);
    if (before == null) continue;
    const after = rewriteTaskImport(before);
    if (after !== before) { io.write(at, after); rewritten.push(name); }
  }
  return rewritten;
}

// Convert the task.mjs in each directory. Capabilities, all repo-relative:
//   exists(p), read(p), write(p, text), remove(p), importModule(p) -> module
// Returns one report line per directory. A directory already carrying a
// task.json keeps it and only loses the module — the JSON is the declaration,
// and a second conversion must not clobber an edit made since the first.
export async function convertTaskDeclarations(taskDirs, io) {
  const schema = schemaPath(io.exists);
  const applied = [];
  for (const dir of taskDirs) {
    const mjs = `${dir}/${TASK_MJS}`;
    const json = `${dir}/${TASK_JSON}`;
    if (!io.exists(mjs)) continue;
    if (io.exists(json)) {
      io.remove(mjs);
      const also = rewriteTaskImporters(dir, io);
      applied.push(`${mjs}: deleted — ${json} already exists and is the declaration`
        + (also.length ? ` (rewrote the import in ${also.join(', ')})` : ''));
      continue;
    }
    const decl = (await io.importModule(mjs)).default;
    if (decl === null || typeof decl !== 'object' || Array.isArray(decl)) {
      applied.push(`${mjs}: not converted — its default export is not a declaration object`);
      continue;
    }
    const comments = moduleComments(io.read(mjs) ?? '');
    const { text, dropped } = serializeTaskDeclaration(decl, posix.relative(dir, schema));
    io.write(json, text);
    io.remove(mjs);
    const rewritten = rewriteTaskImporters(dir, io);
    if (comments) {
      const readme = `${dir}/README.md`;
      io.write(readme, readmeWithNotes(io.read(readme), decl.id ?? dir.slice(dir.lastIndexOf('/') + 1), comments));
    }
    applied.push(`${mjs} -> ${json}${dropped.length ? ` (dropped non-data field${dropped.length > 1 ? 's' : ''}: ${dropped.join(', ')})` : ''}`
      + (rewritten.length ? ` (rewrote the import in ${rewritten.join(', ')})` : '')
      + (comments ? `\n  comments not carried over:\n${comments.split('\n').map((l) => `    ${l}`).join('\n')}` : ''));
  }
  return applied;
}

// The io over a real checkout — the same capability names the migration
// registry's callers build, so the record and the CLI run one converter.
export function checkoutIo(root) {
  const abs = (p) => join(root, p);
  return {
    exists: (p) => existsSync(abs(p)),
    read: (p) => (existsSync(abs(p)) ? readFileSync(abs(p), 'utf8') : null),
    write: (p, text) => { mkdirSync(dirname(abs(p)), { recursive: true }); writeFileSync(abs(p), text); },
    remove: (p) => rmSync(abs(p), { force: true }),
    listDir: (p) => { try { return readdirSync(abs(p)); } catch { return null; } },
    importModule: (p) => import(pathToFileURL(abs(p)).href),
  };
}

// --- the retired `frequency` field --------------------------------------------

// What the field always meant, as the condition that now says it — or null for
// `manual`, which meant no schedule and adds no term. The one mapping the
// contract's door reads (`cadenceTermFor` in packs/claudinite-tasks/calendar.mjs),
// spelled again here because the engine imports no pack; the engine test pins the
// two to each other over every accepted value.
const cadenceTermFor = (frequency) => (frequency === 'manual' ? null : `due:${frequency}`);

// The field wherever it sits: on a line of its own (the converter's layout, and
// nearly every hand-written one) or inline in a one-line object. The commas
// around it are captured so the patch keeps exactly the separators the file needs.
const FREQUENCY_FIELD = /(,[ \t]*)?"frequency"[ \t]*:[ \t]*"([^"]*)"([ \t]*,)?/;
const PRECONDITIONS_ARRAY = /"preconditions"[ \t]*:[ \t]*\[([^\]]*)\]/;
// The same field with its separators, for dropping it whole (`withoutField`).
const PRECONDITIONS_FIELD = /(,[ \t]*)?"preconditions"[ \t]*:[ \t]*(\[[^\]]*\])([ \t]*,)?/;

// Patch one task.json's text: the field goes, the cadence term leads the
// `preconditions` list (created in the field's own place where the file stated
// none), a `none` beside it drops, and the array keeps its own layout — inline or
// one entry per line at its own indent. Returns `{ text, term, frequency }`, or
// null where there is no field or where the patch would leave the file unparsable
// (the file is then left alone; the contract reports it as it is).
export function retireFrequencyText(source) {
  const text = String(source ?? '');
  const field = FREQUENCY_FIELD.exec(text);
  if (!field) return null;
  const frequency = field[2];
  const term = cadenceTermFor(frequency);
  const array = PRECONDITIONS_ARRAY.exec(text);

  let out;
  if (array) {
    let stated;
    try { stated = JSON.parse(`[${array[1]}]`); } catch { return null; }
    if (!stated.every((e) => typeof e === 'string')) return null;
    const kept = stated.filter((e) => e.trim() !== 'none');
    const terms = term === null || kept.includes(term) ? kept : [term, ...kept];
    if (terms.length === 0) {
      // `manual` with nothing beside it: no schedule, which a declaration says by
      // stating no "preconditions" at all — both fields go.
      out = withoutField(withoutField(text, PRECONDITIONS_FIELD), FREQUENCY_FIELD);
      try { JSON.parse(out); } catch { return null; }
      return { text: out, term, frequency };
    }
    const multiline = array[1].includes('\n');
    const itemIndent = multiline ? (/\n([ \t]*)"/.exec(array[1])?.[1] ?? '    ') : null;
    const closeIndent = multiline ? (/\n([ \t]*)$/.exec(array[1])?.[1] ?? '  ') : null;
    const rendered = multiline
      ? `"preconditions": [\n${terms.map((t) => `${itemIndent}${JSON.stringify(t)}`).join(',\n')}\n${closeIndent}]`
      : `"preconditions": [${terms.map((t) => JSON.stringify(t)).join(', ')}]`;
    out = text.replace(PRECONDITIONS_ARRAY, rendered);
    out = withoutField(out, FREQUENCY_FIELD);
  } else if (term === null) {
    // `manual` and no list: the field alone goes, and the declaration states nothing.
    out = withoutField(text, FREQUENCY_FIELD);
  } else {
    // The field's own place becomes the list, its separators kept: a one-entry
    // list on its own lines where the field had a line, inline where it was inline.
    const [whole, leading = '', , trailing = ''] = field;
    const lineStart = text.lastIndexOf('\n', field.index) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart))[0];
    const ownLine = text.slice(lineStart, field.index).trim() === '' && /^[ \t]*(\n|$)/.test(text.slice(field.index + whole.length));
    const list = ownLine
      ? `"preconditions": [\n${indent}  ${JSON.stringify(term)}\n${indent}]`
      : `"preconditions": [${JSON.stringify(term)}]`;
    out = text.slice(0, field.index) + leading + list + trailing + text.slice(field.index + whole.length);
  }
  try { JSON.parse(out); } catch { return null; }
  return { text: out, term, frequency };
}

// Remove a field (matched with its separators, groups 1 and 3) from the text. A
// field alone on its line takes the line with it — and, where it was the object's
// last key, the comma the key before it carried; an inline field leaves exactly one
// separator behind.
function withoutField(text, re) {
  const f = re.exec(text);
  const [whole, leading, , trailing] = f;
  const start = f.index;
  const end = start + whole.length;
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const lineEndAt = text.indexOf('\n', end);
  const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
  const restOfLine = text.slice(lineStart, start) + text.slice(end, lineEnd);
  if (restOfLine.trim() === '') {
    let before = text.slice(0, lineStart);
    if (!trailing) before = before.replace(/,[ \t]*\n$/, '\n');
    return before + text.slice(lineEnd + 1);
  }
  const separator = leading && trailing ? ',' : '';
  const rest = text.slice(end);
  // A key follows: its spacing is the removed field's to give back. None follows
  // (the object's last inline key): the closing brace keeps the space it had.
  return text.slice(0, start) + separator + (trailing ? rest.replace(/^[ \t]+(?=\S)/, leading ? ' ' : '') : rest);
}

// Every `<root>/<pack>/tasks/<task>/` directory under the given pack roots that
// carries a task.json, repo-relative and posix.
export function taskDirsWithJson(packRoots, { listDir, exists }) {
  const out = [];
  for (const root of packRoots) {
    for (const pack of listDir(root) ?? []) {
      const tasks = `${root}/${pack}/tasks`;
      for (const task of listDir(tasks) ?? []) {
        const dir = `${tasks}/${task}`;
        if (exists(`${dir}/${TASK_JSON}`)) out.push(dir);
      }
    }
  }
  return out.sort();
}

// --- the unstated `trigger` -----------------------------------------------------

// Whether a declaration states any condition — the pack's `statesConditions`
// (packs/claudinite-tasks/calendar.mjs), spelled again here because the engine
// imports no pack; the engine test pins the two over one vector set. An entry
// carrying only separators states nothing, which is why this is not a length test.
const statesConditions = (preconditions) => (Array.isArray(preconditions) ? preconditions : [])
  .some((e) => String(e ?? '').split('||').some((alt) => alt.trim() !== ''));

const TRIGGER_FIELD = /(^|[{,\s])"trigger"[ \t]*:/;
// The field goes immediately BEFORE one of these, never after a key: the last key
// of an object carries no comma, so appending past one is what breaks the file.
// `preconditions` first, the pair being one sentence; `expected_outcome` is the
// fallback because the contract requires it, so a declaration always carries one.
const TRIGGER_ANCHORS = [/"preconditions"[ \t]*:/, /"expected_outcome"[ \t]*:/];

// Patch one task.json's text to state the trigger its shape already implied.
// Returns `{ text, trigger }`, or null where the field is already there, the file
// does not parse, no anchor was found, or the patch would leave it unparsable.
// Run AFTER the frequency fold, so the conditions it reads are the final ones.
export function stateTriggerText(source) {
  const text = String(source ?? '');
  if (TRIGGER_FIELD.test(text)) return null;
  let decl;
  try { decl = JSON.parse(text); } catch { return null; }
  if (decl === null || typeof decl !== 'object' || Array.isArray(decl)) return null;
  const trigger = statesConditions(decl.preconditions) ? 'schedule' : 'request';
  const field = `"trigger": ${JSON.stringify(trigger)}`;

  for (const anchor of TRIGGER_ANCHORS) {
    const m = anchor.exec(text);
    if (!m) continue;
    // A key on its own line gets a line of its own at the same indent; one inline
    // in a one-line object gets exactly the separator that object uses.
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const indent = text.slice(lineStart, m.index);
    const out = indent.trim() === ''
      ? `${text.slice(0, m.index)}${field},\n${indent}${text.slice(m.index)}`
      : `${text.slice(0, m.index)}${field}, ${text.slice(m.index)}`;
    try { JSON.parse(out); } catch { return null; }
    return { text: out, trigger };
  }
  return null;
}

// Bring the task.json in each directory up to the current scheduling vocabulary:
// the retired `frequency` folded into `preconditions`, and the `trigger` its shape
// implied stated outright. One report line per file changed; a file a patch cannot
// be made to is reported and left.
export async function updateTaskSchedulingFields(taskDirs, io) {
  const applied = [];
  for (const dir of taskDirs) {
    const json = `${dir}/${TASK_JSON}`;
    let source = io.read(json);
    if (source === null) continue;
    if (FREQUENCY_FIELD.test(source)) {
      const patched = retireFrequencyText(source);
      if (!patched) {
        applied.push(`${json}: not rewritten — its "frequency" could not be folded into "preconditions" as text; edit it by hand`);
        continue;
      }
      source = patched.text;
      io.write(json, source);
      applied.push(patched.term === null
        ? `${json}: frequency "${patched.frequency}" dropped — no schedule, so no preconditions`
        : `${json}: frequency "${patched.frequency}" → "${patched.term}", first in preconditions`);
    }
    const stated = stateTriggerText(source);
    if (stated) {
      io.write(json, stated.text);
      applied.push(`${json}: trigger "${stated.trigger}" stated — the answer its conditions already gave`);
    }
  }
  return applied;
}

export async function main(argv = process.argv.slice(2)) {
  let root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dirs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = argv[++i];
    else dirs.push(argv[i]);
  }
  const io = checkoutIo(root);
  const named = dirs.map((d) => posix.normalize(relative(root, join(root, d)).split('\\').join('/')));
  const targets = dirs.length ? named : taskDirsWithModule([CANON_PACK_ROOT, LOCAL_PACK_ROOT], io);
  const applied = await convertTaskDeclarations(targets, io);
  console.log(applied.length ? applied.join('\n') : 'no task.mjs to convert');
  const retired = await updateTaskSchedulingFields(dirs.length ? named : taskDirsWithJson([CANON_PACK_ROOT, LOCAL_PACK_ROOT], io), io);
  console.log(retired.length ? retired.join('\n') : 'no task.json carries a frequency');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`task-declarations-to-json failed: ${e.message}`); process.exit(1); });
}
