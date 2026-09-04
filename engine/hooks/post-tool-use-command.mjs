#!/usr/bin/env node
// Claude Code PostToolUse hook: a tool result a skill forces itself for
// (`force-load-on-tool-results-matching` in the skill's metadata —
// engine/pack_loader/path-scoped-skills.mjs) gets the load instruction injected
// beside the result, so the diagnosis a symptom calls for (a proxy denial, a
// missing module) is in front of the session the moment the symptom appears.
// Once per session: a skill already loaded is never asked for again. Never
// blocks; a hook that cannot decide says nothing.
import { hooklog } from '../checks/helpers/hook-log.mjs';
import { triggeredSkills, missingSkillsForResult } from '../pack_loader/path-scoped-skills.mjs';
import { readSettings, activePacks, loadedSkills, loadInstruction } from './hook-context.mjs';

async function main(payload) {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (typeof payload.tool_name !== 'string') return;
  const packs = await activePacks(projectRoot, readSettings(projectRoot).packs);
  const declarations = triggeredSkills(packs).filter((d) => d.kind === 'toolResult');
  if (!declarations.length) return;
  const call = { name: payload.tool_name, input: payload.tool_input ?? {} };
  const missing = missingSkillsForResult(call, payload.tool_response, declarations, loadedSkills(payload.transcript_path));
  if (!missing.length) return;
  hooklog('PostToolUse', `skill-trigger ${payload.tool_name} ${missing.map((d) => d.skill).join(',')}`);
  const lines = missing.map((d) =>
    `Claudinite: this ${payload.tool_name} result matches the \`${d.skill}\` skill's trigger (${d.source}, the ${d.pack} pack) — load it before acting on the result: ${loadInstruction([d], projectRoot)}.`);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: lines.join('\n') },
  }));
}

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(input); } catch { /* no payload → nothing to say */ }
  main(payload).then(() => process.exit(0), (e) => {
    hooklog('PostToolUse', `done exit=0 trigger-failed ${e?.message ?? e}`);
    process.exit(0);
  });
});
