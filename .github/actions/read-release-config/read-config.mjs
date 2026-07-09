#!/usr/bin/env node
// Resolves a Chrome-extension repo's release configuration and prints it as
// GitHub Actions step outputs. Runs inside the CALLING repo's checkout (the
// reusable release workflows invoke it via the read-release-config composite
// action), so it reads the caller's own `.github/release.config` and derives
// everything else from the repo name — the caller stub passes no repo values.
//
// `.github/release.config` is a dotenv-style file (KEY=value, `#` comments,
// blank lines ignored). EVERY key is optional: a single-package extension whose
// layout matches the defaults needs no file at all. Recognized keys and their
// defaults:
//
//   manifest_path       extension/manifest.json   the version source of truth
//   package_json_path   package.json              kept in sync with the manifest
//   setup_command       npm ci                    "" skips install (+ npm cache)
//   test_command        npm test                  the full release test gate
//   build_command       npm run build             produces the zip
//   zip_name            <kebab repo name>.zip     stable, never version-stamped
//   zip_path            dist/<zip_name>           where build_command writes it
//   ship_paths          <manifest's top dir>      space-separated shipped roots;
//                                                  the daily change filter counts
//                                                  a release only when one changed
//
// Env: REPO_NAME (github.event.repository.name) for the zip-name derivation;
// GITHUB_OUTPUT for the sink. Dependency-free (node: built-ins only) so it runs
// on a bare runner.

import { readFileSync, existsSync, appendFileSync } from 'node:fs';

const CONFIG_PATH = '.github/release.config';

// PascalCase / camelCase / ALLCAPS repo name -> kebab, matching the standard's
// zip rule (GoogleCalendarEventCreator -> google-calendar-event-creator,
// CrosswordChat -> crossword-chat, TLDR -> tldr).
function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// Parse the dotenv config into a plain object (later keys win). Unknown keys are
// ignored here and rejected by the cer/release-config conformance check, so a
// typo fails review rather than silently doing nothing.
function parseConfig(text) {
  const cfg = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Allow quoting a value whose spaces are significant (e.g. a test command).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    cfg[key] = value;
  }
  return cfg;
}

const repoName = process.env.REPO_NAME;
if (!repoName) {
  console.error('read-config: REPO_NAME env is required (github.event.repository.name).');
  process.exit(1);
}

const cfg = existsSync(CONFIG_PATH) ? parseConfig(readFileSync(CONFIG_PATH, 'utf8')) : {};

const manifest_path = cfg.manifest_path ?? 'extension/manifest.json';
const package_json_path = cfg.package_json_path ?? 'package.json';
const setup_command = cfg.setup_command ?? 'npm ci';
const test_command = cfg.test_command ?? 'npm test';
const build_command = cfg.build_command ?? 'npm run build';
const zip_name = cfg.zip_name ?? `${kebab(repoName)}.zip`;
const zip_path = cfg.zip_path ?? `dist/${zip_name}`;
// The shipped roots default to the manifest's top-level directory — the folder
// Chrome loads as the unpacked extension. A repo that ships a curated subset
// lists those roots explicitly (kept honest against its build by a repo test).
const ship_paths = cfg.ship_paths ?? manifest_path.split('/')[0];

const outputs = {
  manifest_path,
  package_json_path,
  setup_command,
  test_command,
  build_command,
  zip_name,
  zip_path,
  ship_paths,
};

const sink = process.env.GITHUB_OUTPUT;
if (!sink) {
  // Local debugging: print what would be emitted.
  for (const [k, v] of Object.entries(outputs)) console.log(`${k}=${v}`);
  process.exit(0);
}

// Multiline-safe delimiter form, so a value with spaces/newlines round-trips.
let block = '';
for (const [k, v] of Object.entries(outputs)) {
  block += `${k}<<__RELEASE_CFG__\n${v}\n__RELEASE_CFG__\n`;
}
appendFileSync(sink, block);
