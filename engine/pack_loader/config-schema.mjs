import { finding } from '../checks/helpers/findings.mjs';

// A pack's own entry config, validated from a DECLARATION instead of a rule
// module. `.claudinite-checks.json` gives each declared pack an optional
// `config` object, and a pack that reads one has always had to hand-roll the
// same validator: it is an object, these are the properties it knows, this one
// is a positive integer. That is shape, and shape is data — so a pack states it
// as `configSchema` on its manifest (ESLint's `meta.schema` idiom) and the
// engine mints the rule.
//
// The rule keeps the id the pack names, because a member's settings may already
// turn that id off; a conversion that renamed it would silently re-arm the check
// in every repo that had switched it away.
//
// What does NOT belong here: anything beyond shape. A pack whose config feeds a
// resolver its own runtime imports (the preferences store) keeps a coded rule,
// so the check and the reader can never disagree — the same single-source
// argument that keeps the rest of the imported-definition checks coded.
//
// An UNSET key means the pack's default, never "misconfigured": only a declared
// property with a wrong value, an unknown property, or a missing `required` one
// is ever a finding.

// The closed type vocabulary. Each entry is the predicate plus the phrase the
// finding uses to say what was expected, so a new type cannot arrive without its
// own words.
const TYPES = {
  string: { ok: (v) => typeof v === 'string' && v.trim() !== '', expected: 'a non-empty string' },
  boolean: { ok: (v) => typeof v === 'boolean', expected: 'a boolean' },
  positiveInteger: { ok: (v) => Number.isInteger(v) && v >= 1, expected: 'a positive integer' },
  nonEmptyStringArray: {
    ok: (v) => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim() !== ''),
    expected: 'a non-empty array of non-empty strings',
  },
};

const SCHEMA_KEYS = ['ruleId', 'severity', 'why', 'fix', 'description', 'doc', 'properties', 'required'];
const PROPERTY_KEYS = ['type', 'matching'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The schema's own shape, checked where every other manifest field is: a typo
// here would otherwise validate nothing while reading as a live check.
export function validateConfigSchema(schema, err) {
  if (!isPlainObject(schema)) {
    err('"configSchema" is not a valid value', 'configSchema is an object: { ruleId, severity, why, fix, properties }');
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYS.includes(key)) err(`configSchema declares "${key}", which is not one of its fields`, `the fields are: ${SCHEMA_KEYS.join(', ')}`);
  }
  if (typeof schema.ruleId !== 'string' || !schema.ruleId.trim()) {
    err('configSchema names no "ruleId"', 'name the rule id the finding reports under — keep the id the pack\'s coded validator used, so a member\'s settings still address it');
  }
  if (schema.severity !== 'blocking' && schema.severity !== 'advisory') {
    err('configSchema declares no valid "severity"', 'set severity to "blocking" or "advisory"');
  }
  for (const key of ['why', 'fix']) {
    if (typeof schema[key] !== 'string' || !schema[key].trim()) {
      err(`configSchema declares no "${key}"`, key === 'why'
        ? 'state what a malformed config silently does — it is printed on every finding'
        : 'state the single action that fixes the entry');
    }
  }
  if (!isPlainObject(schema.properties)) {
    err('configSchema declares no "properties"', 'give it the properties object — {} where the pack takes no config at all');
    return;
  }
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!isPlainObject(prop)) {
      err(`configSchema property "${name}" is not an object`, `give it { type: <one of ${Object.keys(TYPES).join(', ')}> }`);
      continue;
    }
    for (const key of Object.keys(prop)) {
      if (!PROPERTY_KEYS.includes(key)) err(`configSchema property "${name}" declares "${key}"`, `a property takes: ${PROPERTY_KEYS.join(', ')}`);
    }
    if (!TYPES[prop.type]) {
      err(`configSchema property "${name}" has no known type`, `the types are: ${Object.keys(TYPES).join(', ')}`);
    }
    if (prop.matching !== undefined && !(prop.matching instanceof RegExp)) {
      err(`configSchema property "${name}" has a "matching" that is not a regex`, 'give matching a RegExp the value must match, or drop it');
    }
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((n) => typeof n !== 'string')) {
      err('configSchema "required" is not a list of property names', 'list the property names a member must declare');
      return;
    }
    for (const name of schema.required) {
      if (!(name in schema.properties)) err(`configSchema requires "${name}", which it does not declare`, `add "${name}" to properties, or drop it from required`);
    }
  }
}

// The rule a schema mints: every problem in the member's entry, reported at the
// settings file. Absent config is never a finding — a pack with a required
// property still says nothing until the member declares a config object, since
// "declared this pack" and "configured this pack" are different states and the
// pack that cares about the difference says so with `required`.
export function configSchemaRule(packId, schema) {
  const names = Object.keys(schema.properties);
  const rule = {
    id: schema.ruleId,
    severity: schema.severity,
    scope: 'world',
    description: schema.description ?? `The ${packId} pack entry's config matches the shape the pack declares`,
    ...(schema.doc ? { doc: schema.doc } : {}),
    why: schema.why,

    run(ctx) {
      const config = ctx.config?.packConfig?.[packId];
      if (config === undefined || config === null) return [];
      const out = [];
      const flag = (what) => out.push(finding(rule, {
        file: '.claudinite-checks.json', what: `${packId} config: ${what}`, fix: schema.fix,
      }));
      if (!isPlainObject(config)) {
        flag('must be an object');
        return out;
      }
      if (!names.length) {
        flag('the pack takes no config');
        return out;
      }
      for (const key of Object.keys(config)) {
        if (!names.includes(key)) flag(`unknown property "${key}" — it takes only ${names.map((n) => `"${n}"`).join(', ')}`);
      }
      for (const name of schema.required ?? []) {
        if (!(name in config)) flag(`names no "${name}"`);
      }
      for (const [name, prop] of Object.entries(schema.properties)) {
        if (!(name in config)) continue;
        const value = config[name];
        const type = TYPES[prop.type];
        if (!type.ok(value)) flag(`"${name}" must be ${type.expected}, got ${JSON.stringify(value)}`);
        else if (prop.matching && !prop.matching.test(String(value))) flag(`"${name}" is not in the form the pack reads, got ${JSON.stringify(value)}`);
      }
      return out;
    },
  };
  return rule;
}
