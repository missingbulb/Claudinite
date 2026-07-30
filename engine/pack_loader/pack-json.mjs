// Reading a `pack.json` — the JSON manifest, validated against
// `pack.schema.json` and resolved into the in-memory manifest the rest of the
// engine already consumes.
//
// WHY THE MANIFEST IS DATA. A `pack.mjs` was a module, so discovering a pack
// meant EXECUTING it: every session start and every check run `import()`ed one
// module per pack, including a consumer's own hand-written local packs (which is
// why pack-registry.mjs isolates each import). Almost none of that code was
// doing anything — across the corpus the manifests were mostly `import`
// statements naming rule modules and one-line arrow functions over `ctx.tracked`.
// With the declaration as data, the loader executes code only where a pack
// genuinely has some: the rule modules it was going to load anyway, and the four
// packs whose fingerprint reads file content.
//
// WHAT THE FILENAMES BUY. Rules arrive as filenames rather than imported
// bindings, which makes a guard possible that the module shape could not have:
// every `.mjs` at the pack root must be ACCOUNTED FOR by the manifest — a rule in
// exactly one scope list, or a named `helpers` entry. Before this, a rule module
// that nobody added to the manifest was simply invisible: it sat in the pack,
// passed review as "a check", and ran nowhere.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validate } from './json-schema.mjs';
import { compileDetect } from './detect-spec.mjs';
import { RULE_SCOPES } from './pack-schema.mjs';

// The two manifest filenames. `pack.json` is the shape; `pack.mjs` is the
// pre-2026-07 module shape, still read by the registry while consumer-held local
// packs migrate (the pack-json-manifest baseline migration tracks the fleet).
export const PACK_JSON = 'pack.json';
export const LEGACY_PACK_MANIFEST = 'pack.mjs';

const SCHEMA_FILE = 'pack.schema.json';

// The spec, parsed once. A tree with no readable schema can validate nothing, so
// the failure is reported per pack rather than thrown — the registry's fail-soft
// posture: a diagnostic beats a dead runner.
let schemaCache;
function packSchema() {
  if (schemaCache === undefined) {
    try {
      schemaCache = { schema: JSON.parse(readFileSync(new URL(`./${SCHEMA_FILE}`, import.meta.url), 'utf8')) };
    } catch (e) {
      schemaCache = { error: e.message };
    }
  }
  return schemaCache;
}

const isRule = (v) => v !== null && typeof v === 'object' && typeof v.id === 'string' && typeof v.run === 'function';

const joinShell = (v) => (Array.isArray(v) ? v.join('\n') : v);

// Resolution runs even when the schema has already rejected the manifest — a pack
// whose declaration is incomplete still loads and still runs the checks it CAN
// (silently disabling a repo's own rules is a worse failure than the one being
// reported). So every field read below must survive a value of the wrong type:
// iterating a string where a list belongs would quietly try to import single
// characters, and reading through a missing object would throw out of the loader.
const asList = (v) => (Array.isArray(v) ? v : []);

// Every field whose value NAMES a module, so the accounted-for guard and the
// resolver agree on what a filename means without either re-deciding it.
function declaredModules(raw) {
  const named = new Map(); // filename -> how the manifest names it
  const claim = (file, as) => {
    if (typeof file !== 'string') return;
    if (named.has(file)) named.set(file, `${named.get(file)} and ${as}`);
    else named.set(file, as);
  };
  for (const key of Object.keys(RULE_SCOPES)) for (const f of asList(raw[key])) claim(f, key);
  for (const f of asList(raw.helpers)) claim(f, 'helpers');
  const contributes = raw.contributes !== null && typeof raw.contributes === 'object' ? raw.contributes : {};
  for (const [packId, files] of Object.entries(contributes)) {
    for (const f of asList(files)) claim(f, `contributes.${packId}`);
  }
  claim(raw.contributedRules, 'contributedRules');
  if (typeof raw.detect === 'string') claim(raw.detect, 'detect');
  if (typeof raw.env === 'string') claim(raw.env, 'env');
  return named;
}

/**
 * Read, validate and resolve `<packDir>/pack.json`. Returns
 * `{ manifest, errors }` — `manifest` is null when the file could not be read or
 * parsed at all (there is nothing to run); otherwise it is the resolved manifest
 * and `errors` are `{ what, fix }` diagnostics the caller reports without
 * dropping the pack, exactly as a malformed `pack.mjs` field is reported today.
 * `label` prefixes each message ("the pack in packs/&lt;name&gt;: …").
 */
export async function loadPackJson(packDir, { label } = {}) {
  const errors = [];
  const at = label ? `${label}: ` : '';
  const err = (what, fix) => errors.push({ what: `${at}${what}`, fix });

  let raw;
  try {
    raw = JSON.parse(readFileSync(join(packDir, PACK_JSON), 'utf8'));
  } catch (e) {
    err(`${PACK_JSON} could not be read: ${e.message}`, `fix ${PACK_JSON} — it must be a JSON object matching engine/pack_loader/${SCHEMA_FILE}`);
    return { manifest: null, errors };
  }

  const { schema, error: schemaError } = packSchema();
  if (schemaError) {
    err(`the pack manifest schema could not be read: ${schemaError}`, `restore engine/pack_loader/${SCHEMA_FILE}`);
  } else {
    for (const e of validate(raw, schema)) {
      const where = e.path ? `"${e.path}"` : PACK_JSON;
      err(`${where} ${e.message}`, e.description
        ? `${e.path || 'the manifest'} is ${e.description}`
        : `see engine/pack_loader/${SCHEMA_FILE}`);
    }
  }
  // A shape this broken cannot be resolved into anything runnable; the schema
  // errors above are the whole diagnosis.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { manifest: null, errors };

  checkSchemaPointer(packDir, raw, err);
  checkModulesAccountedFor(packDir, raw, err);

  const manifest = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '$schema' || key === 'helpers') continue; // authoring aids, not engine fields
    manifest[key] = value;
  }

  const load = (file, as) => importDefault(packDir, file, as, err);

  for (const key of Object.keys(RULE_SCOPES)) {
    if (raw[key] === undefined) continue;
    const rules = [];
    for (const file of asList(raw[key])) {
      const mod = await load(file, key);
      if (mod === undefined) continue;
      if (!isRule(mod)) {
        err(`${key} names ${file}, which does not default-export a rule`, `give ${file} a default export with a string "id" and a "run" function, or move it to "helpers"`);
        continue;
      }
      rules.push(mod);
    }
    manifest[key] = rules;
  }

  if (raw.contributes !== null && typeof raw.contributes === 'object' && !Array.isArray(raw.contributes)) {
    const contributes = {};
    for (const [packId, files] of Object.entries(raw.contributes)) {
      const data = [];
      for (const file of asList(files)) {
        const mod = await load(file, `contributes.${packId}`);
        if (mod !== undefined) data.push(mod);
      }
      contributes[packId] = data;
    }
    manifest.contributes = contributes;
  }

  if (typeof raw.contributedRules === 'string') {
    const mod = await load(raw.contributedRules, 'contributedRules');
    if (mod !== undefined && typeof mod !== 'function') {
      err(`contributedRules names ${raw.contributedRules}, which does not default-export a function`, `export default (activePacks) => [...] from ${raw.contributedRules}`);
      delete manifest.contributedRules;
    } else {
      manifest.contributedRules = mod;
    }
  }

  if (typeof raw.env === 'string') {
    const mod = await load(raw.env, 'env');
    if (mod !== undefined && (mod === null || typeof mod !== 'object')) {
      err(`env names ${raw.env}, which does not default-export an object`, `export default { label, setup, probe } from ${raw.env} — setup and probe may be strings or functions of the pack's config`);
      delete manifest.env;
    } else if (mod !== undefined) {
      manifest.env = mod;
    }
  } else if (raw.env !== undefined && raw.env !== null && typeof raw.env === 'object') {
    // A shell fragment may be authored as its LINES; the engine's env runner
    // takes one string per fragment, so the join happens here — once — rather
    // than every reader having to know about both forms.
    manifest.env = { ...raw.env, setup: joinShell(raw.env.setup), probe: joinShell(raw.env.probe) };
  }

  if (typeof raw.detect === 'string') {
    const mod = await load(raw.detect, 'detect');
    if (mod !== undefined && typeof mod !== 'function') {
      err(`detect names ${raw.detect}, which does not default-export a function`, `export default (ctx) => … from ${raw.detect}`);
      manifest.detect = null;
    } else {
      manifest.detect = mod ?? null;
    }
  } else if (raw.detect !== null && typeof raw.detect === 'object' && !Array.isArray(raw.detect)) {
    // A spec with no (or a non-object) `trackedPath` is already a schema error;
    // an unusable predicate becomes an inert null rather than something that
    // throws the first time a fingerprint is evaluated.
    const spec = raw.detect.trackedPath;
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
      manifest.detect = null;
    } else {
      const { detect, errors: detectErrors } = compileDetect({ trackedPath: spec });
      for (const e of detectErrors) err(e.what, e.fix);
      manifest.detect = detect;
    }
  }

  return { manifest, errors };
}

async function importDefault(packDir, file, as, err) {
  const abs = join(packDir, file);
  if (!existsSync(abs)) {
    err(`${as} names ${file}, which the pack directory does not carry`, `create ${file}, or drop it from "${as}"`);
    return undefined;
  }
  let mod;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (e) {
    err(`${file} failed to load: ${e.message}`, `fix ${file}, or drop it from "${as}"`);
    return undefined;
  }
  if (mod.default === undefined) {
    err(`${as} names ${file}, which has no default export`, `add an \`export default\` to ${file}`);
    return undefined;
  }
  return mod.default;
}

// `$schema` is what makes a hand-edited pack.json validate and complete in an
// editor, and a wrong relative depth breaks that SILENTLY — the file still
// loads, the author just stops getting told when they mistype a field. Checked
// only when declared: absence costs nothing but the editor help.
function checkSchemaPointer(packDir, raw, err) {
  const pointer = raw.$schema;
  if (typeof pointer !== 'string') return;
  if (isAbsolute(pointer) || /^[a-z][a-z0-9+.-]*:/i.test(pointer)) return; // a URL or absolute path — nothing local to verify
  const target = resolve(packDir, pointer);
  if (target.endsWith(SCHEMA_FILE) && existsSync(target)) return;
  err(`"$schema" points at ${pointer}, where this tree has no ${SCHEMA_FILE}`,
    `point it at the engine's pack_loader/${SCHEMA_FILE}, relative to this pack directory — a canon pack is two levels up (../../engine/), a consumer's local pack reaches it through its shared mount`);
}

// THE DRIFT GUARD the filename shape buys: nothing in the pack root is invisible.
// Every `.mjs` beside the manifest is either a rule in exactly one scope list, a
// module some other field names (detect, env, contributedRules, a contribution),
// or a declared `helpers` entry. Tests are excluded — a co-located `*.test.mjs`
// is not pack content the engine ever loads.
function checkModulesAccountedFor(packDir, raw, err) {
  const named = declaredModules(raw);
  for (const [file, as] of named) {
    if (as.includes(' and ')) {
      err(`declares ${file} under ${as}`, 'name a module once — a rule belongs to exactly one scope, and a helper is not a rule');
    }
  }
  let present;
  try {
    present = readdirSync(packDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.mjs') && !d.name.endsWith('.test.mjs'))
      .map((d) => d.name).sort();
  } catch {
    return; // the caller already reported an unreadable pack directory
  }
  for (const file of present) {
    if (named.has(file)) continue;
    err(`carries ${file} but declares it nowhere`,
      `add it to "worldRules" or "workRules" if it is a rule, or to "helpers" if it is a library or entry point — an undeclared rule module runs nowhere`);
  }
}
