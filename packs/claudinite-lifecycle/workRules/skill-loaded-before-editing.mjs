import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { isActive } from '../../../engine/pack_loader/pack-registry.mjs';
// Namespace imports with a capability probe, not named ones: the pack and engine
// lanes deliver on their own cadences, and a member holding this pack beside an
// engine that predates the helper must load the pack rather than fault it.
import * as transcript from '../../../engine/checks/helpers/session-transcript.mjs';
import * as scoped from '../../../engine/pack_loader/path-scoped-skills.mjs';

// The Stop-time half of path-scoped skills. The PreToolUse guard stops a file
// tool before the first edit under a scoped pattern; this catches the edits it
// never sees — a `sed`, a heredoc, a script — by asking the same question of the
// diff: did the session load the skill each changed path is scoped to.
const rule = {
  id: 'skill-loaded-before-editing',
  severity: 'blocking',
  description: 'A file a skill forces itself for (force-load-on-file-edits-paths) changed, or a tool call one forces itself for (force-load-on-tool-calls) ran, in a session that never loaded that skill',
  doc: 'engine/pack_loader/path-scoped-skills.mjs',
  scope: 'work',
  why: 'the pack scoped those files to a skill because editing them without it produces work the skill would have prevented; a load after the fact is the review the skill was meant to spare',

  run(work) {
    if (typeof scoped.pathScopedSkills !== 'function' || typeof transcript.skillLoads !== 'function') return [];
    const entries = work.conversation().entries;
    if (!entries || !entries.length) return []; // CI and manual runs carry no transcript
    const active = work.packs.filter((p) => isActive(p, work.config));
    const declarations = scoped.pathScopedSkills(active);
    const loaded = transcript.skillLoads(entries);
    const out = [];
    for (const file of declarations.length ? work.changedFiles : []) {
      for (const d of scoped.missingSkillsFor(file, declarations, loaded)) {
        out.push(finding(rule, {
          file,
          what: `changed under ${d.files}, which the ${d.pack} pack's \`${d.skill}\` skill forces itself for, and this session never loaded that skill`,
          fix: `load it now — Skill tool, skill: "${d.skill}", or Read its SKILL.md — and re-read the change against what it says before stopping`,
        }));
      }
    }
    // The tool-call half: a call a skill forces itself for, made before the
    // session had loaded it (a load later in the session came after the fact).
    if (typeof scoped.triggeredSkills === 'function' && typeof transcript.toolCalls === 'function') {
      const triggers = scoped.triggeredSkills(active).filter((d) => d.kind === 'toolCall');
      const reported = new Set();
      for (const call of triggers.length ? transcript.toolCalls(entries) : []) {
        const loadedByThen = transcript.skillLoads(entries.slice(0, call.index + 1));
        for (const d of scoped.missingSkillsForCall(call, triggers, loadedByThen)) {
          if (reported.has(d.skill)) continue;
          reported.add(d.skill);
          out.push(finding(rule, {
            file: `(session) ${call.name} call`,
            what: `a ${call.name} call the ${d.pack} pack's \`${d.skill}\` skill forces itself for (${d.source}) ran before this session loaded that skill`,
            fix: `load it now — Skill tool, skill: "${d.skill}", or Read its SKILL.md — and re-read what the call did against what it says before stopping`,
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
