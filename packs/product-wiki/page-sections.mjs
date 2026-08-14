import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WIKI_PAGE, WIKI_RESERVED } from './lib.mjs';

export default patternRule({
  id: 'product-wiki-page-sections',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every wiki page carries Key insights, Sources, Growth log, and Open questions sections',
  why: "the sections are the page's reader header plus the wiki's audit trail and backlog — without them compile-once/refine-in-place degrades to unsourced, unreviewable rewrites nobody can read at a glance",
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    sections: ['Key insights', 'Sources', 'Growth log', 'Open questions'],
    requirePresent: {
      what: 'wiki page is missing its "## {section}" section',
      fix: 'add it — every wiki page opens with the Key insights header, then carries the growth machinery: the citations list, the dated growth log, and the open-questions backlog (an empty "## Open questions" is valid)',
    },
  }],
});
