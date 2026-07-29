import { finding } from '../../engine/checks/helpers/findings.mjs';
import { wikiPages, hasSection } from './lib.mjs';

// Every wiki page carries its reader header and the growth machinery as
// top-level sections. `##` is
// the contract (a `###` heading deliberately misses); hasSection tolerates
// case variation and suffix words ("## Open questions (for the next growth
// pass)") and ignores headings inside code fences — an embedded template must
// not satisfy the requirement. A non-wiki README inside wiki space (an assets
// folder) firing here is by design — assets belong under product-wiki/sample-data/;
// a genuine exception uses a reasoned accept.
const SECTIONS = ['Key insights', 'Sources', 'Growth log', 'Open questions'];

const rule = {
  id: 'product-wiki-page-sections',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every wiki page carries Key insights, Sources, Growth log, and Open questions sections',
  why: "the sections are the page's reader header plus the wiki's audit trail and backlog — without them compile-once/refine-in-place degrades to unsourced, unreviewable rewrites nobody can read at a glance",

  run(ctx) {
    const out = [];
    for (const page of wikiPages(ctx.files)) {
      const text = ctx.read(page);
      if (text === null) continue;
      for (const name of SECTIONS) {
        if (!hasSection(text, name)) {
          out.push(finding(rule, {
            file: page,
            what: `wiki page is missing its "## ${name}" section`,
            fix: 'add it — every wiki page opens with the Key insights header, then carries the growth machinery: the citations list, the dated growth log, and the open-questions backlog (an empty "## Open questions" is valid)',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
