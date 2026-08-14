import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WIKI_PAGE, WIKI_RESERVED } from './lib.mjs';

export default patternRule({
  id: 'product-wiki-sources',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every Sources bullet carries its real URL',
  why: 'a named source without its URL is an uncited citation — unverifiable by the next pass and by review',
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    section: 'Sources',
    eachBulletBlockMatches: {
      pattern: /https?:\/\//,
      what: 'Sources bullet carries no URL: "{bullet}"',
      fix: 'every listed source carries its real URL (a markdown link or a bare URL); an honestly-unsourced page explains its status in prose instead of listing URL-less sources',
    },
  }],
});
