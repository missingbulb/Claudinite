import { dirname, join, normalize } from 'node:path';
import { extractLinks } from '../../lib/markdown.mjs';
import { finding } from '../../lib/findings.mjs';

const rule = {
  id: 'reference-integrity',
  severity: 'blocking',
  description: 'Relative Markdown links must resolve, and no tracked file may reference a deleted path',
  doc: 'tasks/textAndFileManipulation.md',
  why: 'a dangling reference breaks silently — no test fails when a doc link or index entry points at nothing',

  run(ctx) {
    const out = [];

    for (const file of ctx.files.filter((f) => f.endsWith('.md'))) {
      const text = ctx.read(file);
      if (text === null) continue;
      for (const { target, line } of extractLinks(text)) {
        const resolved = normalize(join(dirname(file), target));
        if (resolved.startsWith('..')) continue; // outside the repo — not verifiable here
        if (!ctx.exists(resolved)) {
          out.push(finding(rule, {
            file, line,
            what: `relative link → ${target} resolves to ${resolved}, which does not exist`,
            fix: 'correct the path or restore the target; when moving or deleting a file, update every inbound reference in the same change',
          }));
        }
      }
    }

    for (const gone of ctx.deleted) {
      for (const hit of ctx.grepTracked(gone)) {
        if (hit.file === gone) continue;
        out.push(finding(rule, {
          file: hit.file, line: hit.line,
          what: `still references ${gone}, which this branch deletes`,
          fix: `update or remove the reference — grep the whole tree for "${gone}" and fix every hit in this same change`,
        }));
      }
    }

    return out;
  },
};

export default rule;
