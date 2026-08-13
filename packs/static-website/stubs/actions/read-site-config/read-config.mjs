#!/usr/bin/env node
// Reads a static-site repo's `.github/site.config` and emits its keys as step
// outputs. Vendored into each site repo's own .github/actions/; dependency-free
// (node: built-ins only) so it runs on a bare runner with no npm ci.
//
// REQUIRED AND FULLY EXPLICIT — five keys, no defaults. A default that "happens
// to match" a repo's layout silently publishes the wrong tree the day the layout
// or the default changes, and the published set is exactly the thing that must
// never be guessed:
//
//   publish_root    the directory the published site is rooted at ("." = the
//                   repo root). Every publish path is relative to it, and it is
//                   what becomes the site's "/".
//   publish_paths   the explicit publish set — the files and directories under
//                   publish_root that are copied into the artifact, and nothing
//                   else. Space-separated, relative to publish_root.
//   version_files   the files carrying the version, first one the source of
//                   truth. Space-separated.
//   build_command   the command that produces whatever publish_paths names
//                   ("" = nothing to build, stated).
//   test_command    the repo's CI gate ("" = no tests, stated).
//
// A missing file, a missing key, an unknown (typo'd) key and an empty required
// path key are all hard failures — a pipeline that "worked" because a typo fell
// back to a default is the failure mode this shape exists to prevent.
//
// One key is OPTIONAL, and deliberately so:
//
//   build_vars      space-separated names of repo VARIABLES the build may read,
//                   exported into build_command's environment (absent = none).
//
// It is optional because the explicitness rule above exists to stop a default
// from silently publishing the WRONG TREE — and an absent build_vars cannot do
// that. Absent means the build sees no variables, which is what every site did
// before the key existed, so an untouched config keeps its exact meaning. What
// is NOT tolerated is a declared name with no value behind it: that is the
// silently half-configured build — a blank analytics token, an empty base URL —
// baked into a published page, so a declared-but-unset variable fails the run.
//
// VARIABLES, NEVER SECRETS. The exporter beside this file is handed
// `toJSON(vars)`, a context that structurally cannot carry a secret. A value
// that must not appear in a published artifact has no business reaching the
// step whose output IS that artifact, so the boundary is enforced by which
// context the workflow passes, not by a convention someone has to remember.

import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = '.github/site.config';

// The five required keys, plus the one optional key. `allowEmpty` marks the
// values whose empty form is a real, stated answer ("no build" / "no tests")
// rather than an omission; `optional` marks the key a config may leave out
// entirely (see the header for why exactly one key gets that licence).
export const KEYS = [
  { name: 'publish_root', allowEmpty: false },
  { name: 'publish_paths', allowEmpty: false },
  { name: 'version_files', allowEmpty: false },
  { name: 'build_command', allowEmpty: true },
  { name: 'test_command', allowEmpty: true },
  { name: 'build_vars', allowEmpty: true, optional: true },
];

// A build_vars entry becomes an environment variable name, so it must be one.
// Rejecting `FOO=bar` or `foo-bar` here means the failure lands on the config
// line that is wrong, not as an unbound shell name three steps later.
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// dotenv-ish: KEY=value, one per line; # comments and blank lines ignored; the
// value may be wrapped in matching single or double quotes (so a command with
// trailing spaces or a leading # is expressible). Returns { values, errors }.
export function parseConfig(text) {
  const values = new Map();
  const errors = [];
  const known = new Set(KEYS.map((k) => k.name));

  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) {
      errors.push(`${CONFIG_PATH}:${i + 1}: '${line}' is not KEY=value`);
      return;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    if (!known.has(key)) {
      errors.push(`${CONFIG_PATH}:${i + 1}: unknown key '${key}' — the keys are ${[...known].join(', ')}`);
      return;
    }
    if (values.has(key)) errors.push(`${CONFIG_PATH}:${i + 1}: '${key}' is set twice`);
    values.set(key, value);
  });

  for (const { name, allowEmpty, optional } of KEYS) {
    if (!values.has(name)) {
      if (!optional) errors.push(`${CONFIG_PATH}: required key '${name}' is missing`);
    } else if (!allowEmpty && !values.get(name)) {
      errors.push(`${CONFIG_PATH}: '${name}' is empty — it must name a real path`);
    }
  }

  for (const name of (values.get('build_vars') ?? '').split(/\s+/).filter(Boolean)) {
    if (!ENV_NAME.test(name)) {
      errors.push(`${CONFIG_PATH}: build_vars entry '${name}' is not a variable name — list the repo variable NAMES to export, space-separated, never their values`);
    }
  }
  return { values, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let text;
  try {
    text = readFileSync(CONFIG_PATH, 'utf8');
  } catch {
    console.error(`read-site-config: ${CONFIG_PATH} is missing — every static-site repo declares its publish set explicitly.`);
    process.exit(1);
  }

  const { values, errors } = parseConfig(text);
  if (errors.length) {
    for (const e of errors) console.error(`read-site-config: ${e}`);
    process.exit(1);
  }

  // An omitted optional key emits as empty, so every consumer of these outputs
  // sees the same "" it would see from an explicitly empty value.
  const out = KEYS.map(({ name }) => `${name}=${values.get(name) ?? ''}`).join('\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${out}\n`);
  console.log(out);
}
