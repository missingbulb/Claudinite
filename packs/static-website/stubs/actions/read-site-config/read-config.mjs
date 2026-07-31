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

import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = '.github/site.config';

// Keys that must be present. `allowEmpty` marks the two whose empty value is a
// real, stated answer ("no build" / "no tests") rather than an omission.
export const KEYS = [
  { name: 'publish_root', allowEmpty: false },
  { name: 'publish_paths', allowEmpty: false },
  { name: 'version_files', allowEmpty: false },
  { name: 'build_command', allowEmpty: true },
  { name: 'test_command', allowEmpty: true },
];

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

  for (const { name, allowEmpty } of KEYS) {
    if (!values.has(name)) errors.push(`${CONFIG_PATH}: required key '${name}' is missing`);
    else if (!allowEmpty && !values.get(name)) errors.push(`${CONFIG_PATH}: '${name}' is empty — it must name a real path`);
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

  const out = KEYS.map(({ name }) => `${name}=${values.get(name)}`).join('\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${out}\n`);
  console.log(out);
}
