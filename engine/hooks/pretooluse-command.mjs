#!/usr/bin/env node
// Claude Code PreToolUse guard, three duties, in this order:
//  - a file tool (Edit, Write, NotebookEdit) aimed at a path one of an active
//    pack's skills names under `force-load-on-file-edits-paths` is blocked until
//    the session has loaded that skill — so the skill is read before the first
//    edit exists, not after a Stop-time finding has sent the agent back over
//    work done;
//  - the active packs' ACTION declarations (`scope: "action"`, `guardToolCalls` —
//    the vocabulary in engine/checks/helpers/pattern-rules.mjs) are judged
//    against the call about to run: a blocking finding denies it and hands the
//    agent the finding's text, an advisory one lets it run and injects the text
//    as context, so a bias is heard at the moment it applies. The same
//    declarations run again over the transcript at Stop, the backstop for a
//    hook that never fired;
//  - a Bash command that deletes a remote branch is blocked (the delete-push
//    fails in this environment, so it can never succeed).
// Exit 2 blocks the tool call and feeds stderr back to the agent; exit 0 with a
// JSON `hookSpecificOutput` on stdout allows it with added context. Registered
// per-repo on every tool (the converge's PRETOOLUSE_MATCHER) — see bootstrap.md; a
// call no declaration names costs the pack load, about 150 ms, and says nothing.
// A guard that cannot decide lets the call through: an unreadable declaration or
// registry is the mount self-test's finding, never a session wedged on tools.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hooklog } from '../checks/helpers/hook-log.mjs';
import { applyGrace } from '../checks/helpers/findings.mjs';
import { parseEntries, skillLoads, toolCalls } from '../checks/helpers/session-transcript.mjs';
import { guardFindings } from '../checks/helpers/pattern-rules.mjs';
import { packRules } from '../checks/run-active-pack-rules.mjs';
import { pathScopedSkills, missingSkillsFor } from '../pack_loader/path-scoped-skills.mjs';
import { settingsPath } from '../settings-file.mjs';

// This module lives at <corpus>/engine/hooks/ — the same root the mount hook
// resolves the registry from, so the canon runs it from its own tree.
const corpusRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// The file a tool is about to write, repo-relative with forward slashes — or null
// when the tool names no file or the file is outside the project (nothing here
// scopes a path the repo does not own).
function targetPath(payload, projectRoot) {
  const input = payload.tool_input ?? {};
  const raw = payload.tool_name === 'NotebookEdit' ? input.notebook_path : input.file_path;
  if (typeof raw !== 'string' || !raw) return null;
  const abs = isAbsolute(raw) ? raw : resolve(projectRoot, raw);
  const rel = relative(projectRoot, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

// The raw settings, read once: the declared packs (what activates) and the
// per-rule overrides (off / advisory / blocking), project-wide and per pack entry.
function readSettings(projectRoot) {
  const path = settingsPath(projectRoot);
  if (!existsSync(path)) return { packs: [], rules: {} };
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const rules = { ...(raw.rules ?? {}) };
  for (const entry of Array.isArray(raw.packs) ? raw.packs : []) {
    if (entry && typeof entry === 'object') Object.assign(rules, entry.rules ?? {});
  }
  return { packs: Array.isArray(raw.packs) ? raw.packs : [], rules };
}

async function activePacks(projectRoot, declared) {
  const { loadPacks, isActive } = await import(join(corpusRoot, 'engine', 'pack_loader', 'pack-registry.mjs'));
  const packs = await loadPacks({ localRoot: projectRoot });
  return packs.filter((p) => isActive(p, { packs: declared }));
}

function transcriptEntries(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  try { return parseEntries(readFileSync(transcriptPath, 'utf8')); } catch { return []; }
}

const FILE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

function guardFileTool(payload, projectRoot, packs) {
  const path = targetPath(payload, projectRoot);
  if (!path) return;
  const declarations = pathScopedSkills(packs);
  if (!declarations.length) return;
  const missing = missingSkillsFor(path, declarations, skillLoads(transcriptEntries(payload.transcript_path)));
  if (!missing.length) return;
  const names = missing.map((d) => d.skill);
  hooklog('PreToolUse', `done exit=2 skill-not-loaded ${path} needs ${names.join(',')}`);
  // Reading the skill's own file is a load too (the transcript reader counts it), so
  // the message carries that path beside the Skill call.
  const skillFile = (d) => relative(projectRoot, join(d.dir, 'SKILL.md')).split(sep).join('/');
  process.stderr.write(
    `Blocked: ${path} is edited only with the ${names.map((n) => `\`${n}\``).join(' and ')} skill loaded `
    + `(the ${[...new Set(missing.map((d) => d.pack))].join(', ')} pack's skill forces itself for ${missing.map((d) => d.files).join(', ')}). `
    + `Load it first — Skill tool, ${names.map((n) => `skill: "${n}"`).join(', ')}, or Read ${missing.map(skillFile).join(' or ')} — then retry the edit.`,
  );
  process.exit(2);
}

// The action declarations judged against this call. Blocking findings deny
// (exit 2); advisory ones come back as the context to inject. Grace applies as
// at Stop: a blocking guard inside its `since` window advises.
function guardAction(payload, packs, overrides) {
  const rules = packRules(packs).filter((r) => r.scope === 'action' && overrides[r.id] !== 'off');
  if (!rules.length) return '';
  const call = { name: payload.tool_name, input: payload.tool_input ?? {} };
  let prior = null;
  const priorCalls = () => (prior ??= toolCalls(transcriptEntries(payload.transcript_path)));
  let findings = [];
  for (const rule of rules) {
    const countsCalls = (rule.spec?.guardToolCalls ?? []).some((a) => a.atMostPerSession !== undefined);
    let found;
    try { found = guardFindings(rule, call, countsCalls ? priorCalls() : []); }
    catch (e) { hooklog('PreToolUse', `action-guard-failed ${rule.id} ${e?.message ?? e}`); continue; }
    const level = overrides[rule.id];
    findings.push(...found.map((f) => (level === 'advisory' || level === 'blocking' ? { ...f, severity: level } : f)));
  }
  findings = applyGrace(findings);
  const render = (f) => `${f.what}. ${f.why ? `${f.why}. ` : ''}Fix: ${f.fix}`;
  const blocking = findings.filter((f) => f.severity === 'blocking');
  if (blocking.length) {
    hooklog('PreToolUse', `done exit=2 action-guard ${blocking.map((f) => f.rule).join(',')}`);
    process.stderr.write(blocking.map((f) => `Blocked by ${f.rule}: ${render(f)}`).join('\n'));
    process.exit(2);
  }
  const advisory = findings.filter((f) => f.severity === 'advisory');
  if (!advisory.length) return '';
  hooklog('PreToolUse', `advisory action-guard ${advisory.map((f) => f.rule).join(',')}`);
  return advisory.map((f) => `[claudinite ${f.rule}] ${render(f)}`).join('\n');
}

function guardRemoteBranchDelete(payload) {
  const cmd = payload.tool_input?.command ?? '';
  const deletesRemoteBranch =
    /\bgit\s+push\b[^\n;&]*\s(--delete|-d)\s/.test(cmd) ||
    /\bgit\s+push\b[^\n;&]*\s\S+\s+:\S/.test(cmd);
  if (!deletesRemoteBranch) return;
  // Log only the block — the interesting event. An allowed command every Bash
  // call would flood the log and drown the SessionStart signal it exists for.
  hooklog('PreToolUse', 'done exit=2 blocked-remote-branch-delete');
  process.stderr.write(
    'Blocked: never delete a remote branch — a current environment bug makes the delete-push fail, so it cannot succeed. Leave the branch; it can be deleted from the GitHub UI if needed.'
  );
  process.exit(2);
}

async function main(payload) {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let context = '';
  try {
    const { packs: declared, rules: overrides } = readSettings(projectRoot);
    const packs = await activePacks(projectRoot, declared);
    if (FILE_TOOLS.has(payload.tool_name)) guardFileTool(payload, projectRoot, packs);
    context = guardAction(payload, packs, overrides);
  } catch (e) {
    hooklog('PreToolUse', `done exit=0 guard-failed ${e?.message ?? e}`);
  }
  if (payload.tool_name === 'Bash') guardRemoteBranchDelete(payload);
  if (context) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext: context },
    }));
  }
  process.exit(0);
}

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(input); } catch { /* no payload → allow */ }
  if (typeof payload.tool_name !== 'string') process.exit(0);
  main(payload).catch((e) => {
    hooklog('PreToolUse', `done exit=0 guard-failed ${e?.message ?? e}`);
    process.exit(0);
  });
});
