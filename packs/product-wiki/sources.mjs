import { finding } from '../../checks/lib/findings.mjs';
import { wikiPages, sectionBody, BULLET } from './lib.mjs';

// Citation discipline: every top-level bullet in a Sources section carries
// its real URL — a markdown link or a bare URL both verify; the invariant is
// reachability, not link typography. A bullet is judged over its whole
// block — the bullet line plus its indented continuation lines — so a
// hard-wrapped source whose URL lands on the next line is not a false
// positive. Prose paragraphs in the section are allowed and unchecked: a page
// honestly explaining its unsourced-hypothesis status in prose passes; a
// bullet NAMING a source with no URL is the always-wrong case. No non-empty
// requirement (a newborn page is legitimately thin), and no URL liveness
// probe (network in a check breaks offline determinism).
const URL = /https?:\/\//;

const rule = {
  id: 'product-wiki-sources',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every Sources bullet carries its real URL',
  why: 'a named source without its URL is an uncited citation — unverifiable by the next pass and by review',

  run(ctx) {
    const out = [];
    for (const page of wikiPages(ctx.files)) {
      const text = ctx.read(page);
      if (text === null) continue;
      const section = sectionBody(text, 'sources');
      if (section === null) continue; // page-sections owns the missing heading
      for (let i = 0; i < section.length; i++) {
        if (!BULLET.test(section[i].text)) continue;
        let block = section[i].text;
        for (let j = i + 1; j < section.length && /^\s+\S/.test(section[j].text); j++) {
          block += ` ${section[j].text.trim()}`;
        }
        if (!URL.test(block)) {
          out.push(finding(rule, {
            file: page,
            line: section[i].line,
            what: `Sources bullet carries no URL: "${section[i].text.trim().slice(0, 80)}"`,
            fix: 'every listed source carries its real URL (a markdown link or a bare URL); an honestly-unsourced page explains its status in prose instead of listing URL-less sources',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
