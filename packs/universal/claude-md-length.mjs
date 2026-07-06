import { finding } from '../../checks/lib/findings.mjs';

const LIMIT = 200;

// Converted from authoring-agent-docs: "Target under 200 lines per CLAUDE.md;
// longer files consume more context and reduce adherence." Directional → advisory.
const rule = {
  id: 'claude-md-length',
  severity: 'advisory',
  description: 'A CLAUDE.md over ~200 lines costs context and reduces adherence',
  doc: 'skills/authoring-agent-docs/SKILL.md',
  why: 'everything in CLAUDE.md loads every session; past ~200 lines it crowds out the rules that matter',

  run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => f === 'CLAUDE.md' || f.endsWith('/CLAUDE.md'))) {
      const text = ctx.read(file);
      if (text === null) continue;
      const lines = text.split('\n').length;
      if (lines > LIMIT) {
        out.push(finding(rule, {
          file, line: LIMIT + 1,
          what: `${lines} lines (target under ${LIMIT})`,
          fix: 'move multi-step procedures to skills and part-of-repo rules to path-scoped packs; keep CLAUDE.md to always-true facts',
        }));
      }
    }
    return out;
  },
};

export default rule;
