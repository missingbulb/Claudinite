#!/usr/bin/env node
// Resolves a Chrome-extension repo's release configuration and prints it as
// GitHub Actions step outputs. Runs inside the CALLING repo's checkout (the
// reusable release workflows invoke it via the read-release-config composite
// action), so it reads the caller's own `.github/release.config`.
//
// `.github/release.config` is a dotenv-style file (KEY=value, `#` comments,
// blank lines ignored) and is REQUIRED — every key is mandatory, there are no
// silent defaults (a default that "happens to match" a repo's layout is exactly
// the drift risk this design avoids). A missing file or a missing/unknown key
// fails the run loudly. Required keys:
//
//   manifest_path       the extension manifest (the version source of truth)
//   package_json_path   the package.json kept in sync with the manifest
//   setup_command       dependency-install command ("" = no install, stated)
//   test_command        the full release test gate
//   ship_paths          space-separated shipped roots (the daily change filter)
//   zip_path            where the build writes the zip (build is always
//                       `npm run build`, so it is not a key)
//
// zip_name is DERIVED as basename(zip_path) — the one mechanical value, taken
// from an explicit required key rather than guessed from the repo name.
//
// Dependency-free (node: built-ins only) so it runs on a bare runner.

import { readFileSync, existsSync, appendFileSync } from 'node:fs';

const CONFIG_PATH = '.github/release.config';

const REQUIRED_KEYS = [
  'manifest_path',
  'package_json_path',
  'setup_command',
  'test_command',
  'ship_paths',
  'zip_path',
];

function fail(msg) {
  console.error(`read-release-config: ${msg}`);
  process.exit(1);
}

// Parse the dotenv config into a plain object (later keys win). setup_command
// may be empty (an explicit "no install") — present-but-empty is valid, absent
// is not.
function parseConfig(text) {
  const cfg = {};
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) fail(`${CONFIG_PATH}:${i + 1} is not KEY=value or a # comment: "${line}"`);
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    cfg[key] = value;
  });
  return cfg;
}

if (!existsSync(CONFIG_PATH)) {
  fail(`${CONFIG_PATH} is required — every extension repo declares its release config explicitly (see the chrome-extension-release standard in Claudinite).`);
}

const cfg = parseConfig(readFileSync(CONFIG_PATH, 'utf8'));

const missing = REQUIRED_KEYS.filter((k) => !(k in cfg));
if (missing.length) fail(`${CONFIG_PATH} is missing required key(s): ${missing.join(', ')}`);

const unknown = Object.keys(cfg).filter((k) => !REQUIRED_KEYS.includes(k));
if (unknown.length) fail(`${CONFIG_PATH} has unknown key(s): ${unknown.join(', ')} (valid: ${REQUIRED_KEYS.join(', ')})`);

const outputs = {
  manifest_path: cfg.manifest_path,
  package_json_path: cfg.package_json_path,
  setup_command: cfg.setup_command,
  test_command: cfg.test_command,
  ship_paths: cfg.ship_paths,
  zip_path: cfg.zip_path,
  // Derived: the release asset filename is the built zip's basename.
  zip_name: cfg.zip_path.split('/').pop(),
};

const sink = process.env.GITHUB_OUTPUT;
if (!sink) {
  for (const [k, v] of Object.entries(outputs)) console.log(`${k}=${v}`);
  process.exit(0);
}

// Multiline-safe delimiter form, so a value with spaces round-trips.
let block = '';
for (const [k, v] of Object.entries(outputs)) {
  block += `${k}<<__RELEASE_CFG__\n${v}\n__RELEASE_CFG__\n`;
}
appendFileSync(sink, block);
