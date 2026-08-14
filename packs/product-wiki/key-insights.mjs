import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WIKI_PAGE, WIKI_RESERVED } from './lib.mjs';

export default patternRule({
  id: 'product-wiki-key-insights',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every wiki page opens with a succinct bulleted Key insights header',
  why: 'a research page whose findings can only be recovered by reading it end to end does not get read — the header is what makes a compiled wiki usable to a human',
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    section: 'Key insights',
    requireFirstOnPage: {
      what: 'the page opens with "## {first}", not its "## Key insights" header',
      fix: 'move "## Key insights" above every other section — a header a reader reaches after the body is not a header',
    },
    forbidProseLines: {
      what: 'prose in the Key insights header: "{line}"',
      fix: 'the header is a bulleted list only — make it a bullet or move it into the page body below the "## Key insights" section',
    },
    maxBulletBlockLength: {
      characters: 140,
      what: 'Key insights bullet runs {characters} characters (max 140): "{bullet}…"',
      fix: 'cut it to the finding in plain words — the qualifiers, the supporting detail and the citation all live in the page body',
    },
    minBullets: {
      count: 1,
      what: 'Key insights header carries no bullets',
      fix: 'open the page with "## Key insights" — up to 7 bullets, each one finding stated plainly in a line (max 140 characters), together enough for a reader to understand what the research found without reading the body',
    },
    maxBullets: {
      count: 7,
      what: 'Key insights header carries {bullets} bullets (max 7) — it has grown into a second body',
      fix: 'keep the 7 that matter most; the rest is what the page body is for',
    },
  }],
});
