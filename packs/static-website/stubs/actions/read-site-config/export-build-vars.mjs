#!/usr/bin/env node
// Exports the repo variables a site.config declares in `build_vars` into the
// build step's environment, via $GITHUB_ENV. Vendored beside read-config.mjs;
// dependency-free (node: built-ins only) so it runs on a bare runner.
//
// Two environment inputs, both set by the calling workflow:
//   DECLARED_BUILD_VARS  the config's build_vars value (space-separated names)
//   REPO_VARS_JSON       `toJSON(vars)` — the repo/org/environment VARIABLES
//
// REPO_VARS_JSON is deliberately the `vars` context and never `secrets`: this
// script's output feeds the step that produces the published artifact, and a
// context that cannot carry a secret cannot leak one into a published page.
//
// A DECLARED NAME WITH NO VALUE IS A HARD FAILURE. The alternative — exporting
// an empty string — is the failure this whole config shape exists to prevent,
// just one level down: the build succeeds, the page ships, and the feature that
// needed the value is silently dead on the live site. Better to fail the deploy
// with the variable's name than to publish a page with a blank token in it.

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function resolve(declaredText, repoVars) {
  const names = (declaredText ?? '').split(/\s+/).filter(Boolean);
  const resolved = [];
  const missing = [];
  for (const name of names) {
    const value = repoVars?.[name];
    // Unset and empty are the same failure: nothing usable behind the name.
    if (value === undefined || value === null || value === '') missing.push(name);
    else resolved.push([name, String(value)]);
  }
  return { resolved, missing };
}

// $GITHUB_ENV is line-oriented, so a value containing a newline needs the
// heredoc form; the delimiter is name-derived so it cannot collide with the
// value's own text.
export function toGithubEnv(pairs) {
  return pairs
    .map(([name, value]) => (value.includes('\n')
      ? `${name}<<__EOF_${name}__\n${value}\n__EOF_${name}__`
      : `${name}=${value}`))
    .join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const declared = process.env.DECLARED_BUILD_VARS ?? '';
  if (!declared.trim()) process.exit(0);

  let repoVars;
  try {
    repoVars = JSON.parse(process.env.REPO_VARS_JSON || '{}');
  } catch {
    console.error('export-build-vars: REPO_VARS_JSON is not valid JSON — the workflow must pass ${{ toJSON(vars) }}.');
    process.exit(1);
  }

  const { resolved, missing } = resolve(declared, repoVars);
  if (missing.length) {
    console.error(`export-build-vars: .github/site.config declares ${missing.length === 1 ? 'a build variable' : 'build variables'} with no value in this repo: ${missing.join(', ')}.`);
    console.error('Set them under Settings → Secrets and variables → Actions → Variables, or drop the name from build_vars.');
    console.error('Failing here rather than building with a blank value, which would publish a page with the feature silently dead.');
    process.exit(1);
  }

  if (process.env.GITHUB_ENV && resolved.length) {
    appendFileSync(process.env.GITHUB_ENV, `${toGithubEnv(resolved)}\n`);
  }
  // Names only — the values belong in the build's environment, not in a log.
  console.log(`export-build-vars: exported ${resolved.map(([n]) => n).join(', ')}`);
}
