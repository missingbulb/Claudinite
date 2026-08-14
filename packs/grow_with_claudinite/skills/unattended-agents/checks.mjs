import { patternRule } from '../../../../engine/checks/helpers/pattern-rules.mjs';
import routineStructure from './routine-structure.mjs';

// A skill owns the test-the-world checks that validate the action its SKILL.md
// defines — kept beside the prose they enforce, not scattered into a pack. The
// runner discovers any skills/<name>/checks.mjs (default export = an array of
// rules) and runs them unconditionally — skills aren't declared the way packs
// are; these are standing invariants, inert until their artifact exists. The
// declared check below is a pattern spec, not code — vocabulary in the
// pattern-rules helper's header.
const IN_SESSION_FIX = 'reach GitHub through the session’s injected MCP-backed I/O (a gh(path) reader for reads, a semantic io object for writes); move any work that needs an account-wide credential into a workflow_dispatch-only executor';

export const inSessionGithubAccess = patternRule({
  id: 'in-session-github-access',
  severity: 'blocking',
  description: 'In-session routine code reaches GitHub through the MCP tools, not a REST client + GITHUB_TOKEN',
  doc: 'skills/unattended-agents/SKILL.md',
  why: 'a routine runs in an MCP-only session with no shell GitHub REST credential; a REST client / GITHUB_TOKEN in its own steps cannot authenticate there — that belongs in a workflow_dispatch-only CI executor',
  scanFiles: /^(routines|migrations)\/.*\.mjs$/,
  excludeFiles: /\.test\.mjs$/,
  skipLinesMatching: /^\s*(\/\/|\*|\/\*)/,
  matchLines: [
    {
      match: /process\.env\.(GITHUB_TOKEN|GH_TOKEN|FLEET_GITHUB_TOKEN)/,
      what: 'reads a GitHub REST token from the environment — in-session routine code has no REST credential',
      fix: IN_SESSION_FIX,
    },
    {
      match: /\bmakeGh\s*\(|from\s+['"][^'"]*\bfleet-api/,
      what: 'uses the REST client (makeGh / fleet-api) — in-session routine code has no REST credential',
      fix: IN_SESSION_FIX,
    },
    {
      match: /['"`]https?:\/\/api\.github\.com/,
      what: 'targets the GitHub REST API (api.github.com) directly — in-session routine code has no REST credential',
      fix: IN_SESSION_FIX,
    },
  ],
});

export default [routineStructure, inSessionGithubAccess];
