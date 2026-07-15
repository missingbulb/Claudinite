import { finding } from '../../checks/lib/findings.mjs';
import { wikiPages, sectionBody } from './lib.mjs';

// Citation discipline: every top-level bullet in a Sources section is a
// markdown link to its real URL. Prose paragraphs in the section are allowed
// and unchecked — a page honestly explaining its unsourced-hypothesis status
// in prose passes; a bullet NAMING a source with no URL is the always-wrong
// case. No non-empty requirement (a newborn page is legitimately thin), and
// no URL liveness probe (network in a check breaks offline determinism).
const LINK = /\[[^\]]*\]\(https?:\/\/[^)]+\)/;

const rule = {
  id: 'product-wiki-sources',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every Sources bullet is a markdown link to its real URL',
  why: 'a named source without its URL is an uncited citation — unverifiable by the next pass and by review',

  run(ctx) {
    const out = [];
    for (const page of wikiPages(ctx.files)) {
      const text = ctx.read(page);
      if (text === null) continue;
      const section = sectionBody(text, 'sources');
      if (section === null) continue; // page-sections owns the missing heading
      for (const { line, text: t } of section.lines) {
        if (!/^[-*]\s/.test(t)) continue; // top-level bullets only
        if (!LINK.test(t)) {
          out.push(finding(rule, {
            file: page, line,
            what: `Sources bullet carries no URL: "${t.trim().slice(0, 80)}"`,
            fix: 'every listed source is a markdown link to its real URL; an honestly-unsourced page explains its status in prose instead of listing linkless sources',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
