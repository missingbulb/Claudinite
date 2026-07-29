// A JSON Schema validator covering exactly the keywords `pack.schema.json` uses
// — the one thing standing between a hand-edited `pack.json` and the engine.
//
// WHY NOT A LIBRARY. A validator is reachable from every consumer's SessionStart
// hook and every check run, in repos whose only guaranteed runtime is the Node in
// the base image. The engine ships dependency-free (engine/checks/helpers/module-imports.mjs
// draws that line), so a schema library would be the first exception, carried by
// the whole fleet, to read one small file. The subset below is ~100 lines and the
// schema it must serve is in this same directory.
//
// WHY IT REFUSES WHAT IT DOES NOT KNOW. An unsupported keyword is reported as a
// SCHEMA fault, not skipped. A validator that silently ignores `oneOf` would let
// a future schema edit look enforced while enforcing nothing — the exact failure
// mode a hand-rolled subset invites. Failing loudly means the canon's own test
// run (engine-tests/pack_loader/json-schema.test.mjs validates the schema's
// keyword usage; every canon pack is loaded in CI) catches the gap before it
// ships, and the fix is to add the keyword here.
//
// Dependency-free and pure: no imports, no filesystem. The caller supplies the
// parsed schema and the parsed instance.

// Keywords that only annotate. Present for humans and editors; nothing to check.
const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', '$defs', 'default', 'examples']);

// Keywords this validator implements. Everything else is a schema fault.
const SUPPORTED = new Set([
  '$ref', 'type', 'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'minProperties', 'pattern', 'minLength', 'minimum', 'anyOf',
]);

// JSON's type names, with `integer` distinguished as the schema spells it.
const typeName = (v) =>
  v === null ? 'null'
    : Array.isArray(v) ? 'array'
      : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number')
        : typeof v;

const isType = (v, t) =>
  t === 'number' ? typeof v === 'number'
    : t === 'integer' ? Number.isInteger(v)
      : typeName(v) === t;

// A readable path to the offending value: '' for the root, then dotted property
// names and bracketed array indices ('worldRules[2]', 'contributes.barriers[0]').
const child = (path, key) => (path ? `${path}.${key}` : key);
const index = (path, i) => `${path}[${i}]`;

// Only local pointers into `$defs` (and the whole schema) resolve — a pack
// manifest schema has no business fetching a remote one at load.
function resolveRef(ref, root) {
  if (ref === '#') return root;
  const m = /^#\/\$defs\/([^/]+)$/.exec(ref);
  return m ? root.$defs?.[m[1]] : undefined;
}

/**
 * Validate `instance` against `schema`. Returns `{ path, message, description }`
 * errors — `description` is the failing schema node's own `description`, which is
 * what a caller turns into the "fix" half of a diagnostic. `[]` means valid.
 * Never throws: a malformed schema is reported as an error like any other.
 */
export function validate(instance, schema) {
  const errors = [];
  check(instance, schema, '', schema, errors);
  return errors;
}

function check(value, node, path, root, errors) {
  const fault = (message) => errors.push({ path, message, description: undefined, schemaFault: true });
  const fail = (message, at = path, desc = node.description) =>
    errors.push({ path: at, message, description: desc });

  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    fault('the schema at this position is not an object');
    return;
  }
  for (const key of Object.keys(node)) {
    if (!SUPPORTED.has(key) && !ANNOTATIONS.has(key)) {
      fault(`the schema at this position uses "${key}", which this validator does not implement`);
      return;
    }
  }

  if (node.$ref !== undefined) {
    const target = resolveRef(node.$ref, root);
    if (target === undefined) {
      fault(`the schema $ref "${node.$ref}" does not resolve`);
      return;
    }
    const from = errors.length;
    check(value, target, path, root, errors);
    // A `$ref` alongside a `description` (legal in 2020-12) states what this
    // USE of the definition means; prefer it over the definition's own wording.
    if (node.description) {
      for (let i = from; i < errors.length; i += 1) {
        if (errors[i].path === path && !errors[i].schemaFault) errors[i].description = node.description;
      }
    }
  }

  if (node.anyOf !== undefined) {
    const probes = node.anyOf.map((branch) => {
      const found = [];
      check(value, branch, path, root, found);
      return found;
    });
    if (probes.some((p) => p.length === 0)) return;
    // A union whose branches all complain about the value ITSELF ("detect is
    // 42") gets one error at the union's own node — three type mismatches bury
    // the one thing the author needs to read. But a value that clearly MEANT one
    // branch and got its interior wrong (`env` with no `probe`) is recognizable:
    // exactly that branch complains about something deeper than the union node,
    // and its errors are the useful ones.
    const intended = probes.filter((p) => p.every((e) => e.path !== path));
    if (intended.length === 1) errors.push(...intended[0]);
    else fail('does not match any allowed form');
    return;
  }

  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (!types.some((t) => isType(value, t))) {
      fail(`is ${typeName(value)}, not ${types.map((t) => `"${t}"`).join(' or ')}`);
      return; // every remaining keyword is type-specific
    }
  }

  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) {
      fail(node.minLength === 1 ? 'is empty' : `is shorter than ${node.minLength} characters`);
    }
    if (node.pattern !== undefined && !new RegExp(node.pattern).test(value)) {
      fail(`does not match ${node.pattern}`);
    }
  }

  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) {
    fail(`is below the minimum of ${node.minimum}`);
  }

  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      fail(node.minItems === 1 ? 'is empty' : `has fewer than ${node.minItems} entries`);
    }
    if (node.items !== undefined) {
      value.forEach((entry, i) => check(entry, node.items, index(path, i), root, errors));
    }
    return; // the object keywords below must not read an array's indices
  }

  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (node.minProperties !== undefined && keys.length < node.minProperties) {
      fail(node.minProperties === 1 ? 'declares nothing' : `declares fewer than ${node.minProperties} fields`);
    }
    for (const key of node.required ?? []) {
      if (!(key in value)) {
        fail('is required', child(path, key), node.properties?.[key]?.description ?? node.description);
      }
    }
    for (const key of keys) {
      const sub = node.properties?.[key];
      if (sub !== undefined) {
        check(value[key], sub, child(path, key), root, errors);
        continue;
      }
      if (node.additionalProperties === false) {
        const known = Object.keys(node.properties ?? {}).join(', ');
        fail(`is not a known field${known ? ` — the known fields are: ${known}` : ''}`, child(path, key), undefined);
        continue;
      }
      if (node.additionalProperties !== undefined) {
        check(value[key], node.additionalProperties, child(path, key), root, errors);
      }
    }
  }
}

/**
 * The keyword audit, for a test to run over a schema document: every keyword
 * used anywhere in `schema` is one this validator implements. Returns the
 * unsupported keyword names, deduplicated — `[]` when the schema is fully
 * covered. Without this, an unsupported keyword is only discovered when some
 * instance happens to reach that node.
 */
export function unsupportedKeywords(schema) {
  const found = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    for (const [key, sub] of Object.entries(node)) {
      if (!SUPPORTED.has(key) && !ANNOTATIONS.has(key)) found.add(key);
      // Descend only through the keywords whose values are schemas (or maps and
      // lists of them) — `required: ['id']` is data, not a nested schema.
      if (key === 'properties' || key === '$defs') Object.values(sub ?? {}).forEach(walk);
      else if (key === 'items' || key === 'additionalProperties') { if (typeof sub === 'object') walk(sub); }
      else if (key === 'anyOf') walk(sub);
    }
  };
  walk(schema);
  return [...found].sort();
}
