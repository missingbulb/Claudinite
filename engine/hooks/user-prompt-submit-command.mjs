#!/usr/bin/env node
// Claude Code UserPromptSubmit hook: an owner prompt a skill forces itself for
// (`force-load-on-prompts-matching` in the skill's metadata —
// engine/pack_loader/path-scoped-skills.mjs) gets the load instruction injected
// beside the prompt, so the procedure the phrase names ("LGTM", "/do-later")
// is in front of the session before it acts. Once per session: a skill already
// loaded is never asked for again. Never blocks, and a hook that cannot decide
// says nothing — an unreadable registry is the mount self-test's finding.
import { hooklog } from '../checks/helpers/hook-log.mjs';
import { triggeredSkills, missingSkillsForPrompt } from '../pack_loader/path-scoped-skills.mjs';
import { readSettings, activePacks, loadedSkills, loadInstruction } from './hook-context.mjs';

async function main(payload) {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  if (!prompt.trim()) return;
  const packs = await activePacks(projectRoot, readSettings(projectRoot).packs);
  const declarations = triggeredSkills(packs).filter((d) => d.kind === 'prompt');
  if (!declarations.length) return;
  const missing = missingSkillsForPrompt(prompt, declarations, loadedSkills(payload.transcript_path));
  if (!missing.length) return;
  hooklog('UserPromptSubmit', `skill-trigger ${missing.map((d) => d.skill).join(',')}`);
  const lines = missing.map((d) =>
    `Claudinite: this prompt matches the \`${d.skill}\` skill's trigger (${d.source}, the ${d.pack} pack) — load it before acting on the prompt: ${loadInstruction([d], projectRoot)}.`);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: lines.join('\n') },
  }));
}

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(input); } catch { /* no payload → nothing to say */ }
  main(payload).then(() => process.exit(0), (e) => {
    hooklog('UserPromptSubmit', `done exit=0 trigger-failed ${e?.message ?? e}`);
    process.exit(0);
  });
});
