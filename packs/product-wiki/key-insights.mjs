import { finding } from '../../engine/checks/helpers/findings.mjs';
import { wikiPages, sectionBody, firstSection, BULLET } from './lib.mjs';

// The reader's entry point: every wiki page OPENS with a short bulleted list of
// what the research actually found, so a human gets the page's understanding
// without reading it end to end (the body stays the research record). Four
// always-wrong shapes are checkable, and only those — WHICH insights lead is
// judgment, owned by the prose and the growth worker:
//   * the header sits below another section (it isn't a header then);
//   * it carries no bullets (an empty promise at the top of the page);
//   * it has grown into a second body (more than MAX bullets);
//   * a bullet is a paragraph rather than a line (over MAX_CHARS).
// Prose lines in the section are flagged for the same reason: the contract is a
// scannable list, not a summary paragraph. Indented continuation lines belong to
// the bullet above them (judged as one block, like a Sources citation), so a
// hard-wrapped insight is never a false positive. Presence of the heading itself
// is page-sections' finding — never double-reported here.
//
// MAX_CHARS is deliberately tight — roughly one line of prose. A header is worth
// having only if it is faster to read than the page, and the failure mode in
// practice is a bullet that keeps qualifying itself. The nuance the qualifier
// wanted belongs in the body; the header states the finding plainly and stops.
const MAX = 7;
const MAX_CHARS = 140;
const NAME = 'Key insights';
const FIX = `open the page with "## ${NAME}" — up to ${MAX} bullets, each one finding stated plainly in a line (max ${MAX_CHARS} characters), together enough for a reader to understand what the research found without reading the body`;

const rule = {
  id: 'product-wiki-key-insights',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every wiki page opens with a succinct bulleted Key insights header',
  why: 'a research page whose findings can only be recovered by reading it end to end does not get read — the header is what makes a compiled wiki usable to a human',

  run(ctx) {
    const out = [];
    for (const page of wikiPages(ctx.files)) {
      const text = ctx.read(page);
      if (text === null) continue;
      const section = sectionBody(text, NAME);
      if (section === null) continue; // page-sections owns the missing heading

      const first = firstSection(text);
      if (first !== null && !new RegExp(`^${NAME}\\b`, 'i').test(first)) {
        out.push(finding(rule, {
          file: page,
          what: `the page opens with "## ${first}", not its "## ${NAME}" header`,
          fix: `move "## ${NAME}" above every other section — a header a reader reaches after the body is not a header`,
        }));
      }

      let bullets = 0;
      for (let i = 0; i < section.length; i++) {
        const { line, text: t } = section[i];
        if (!BULLET.test(t)) {
          // Blank lines and a bullet's own indented continuation lines are the
          // list's own shape; anything else is prose in a list-only section.
          if (t.trim() !== '' && !/^\s+\S/.test(t)) {
            out.push(finding(rule, {
              file: page, line,
              what: `prose in the ${NAME} header: "${t.trim().slice(0, 80)}"`,
              fix: `the header is a bulleted list only — make it a bullet or move it into the page body below the "## ${NAME}" section`,
            }));
          }
          continue;
        }
        bullets += 1;
        let block = t;
        for (let j = i + 1; j < section.length && /^\s+\S/.test(section[j].text); j++) {
          block += ` ${section[j].text.trim()}`;
        }
        if (block.trim().length > MAX_CHARS) {
          out.push(finding(rule, {
            file: page, line,
            what: `${NAME} bullet runs ${block.trim().length} characters (max ${MAX_CHARS}): "${t.trim().slice(0, 80)}…"`,
            fix: 'cut it to the finding in plain words — the qualifiers, the supporting detail and the citation all live in the page body',
          }));
        }
      }

      if (bullets === 0) {
        out.push(finding(rule, { file: page, what: `${NAME} header carries no bullets`, fix: FIX }));
      } else if (bullets > MAX) {
        out.push(finding(rule, {
          file: page,
          what: `${NAME} header carries ${bullets} bullets (max ${MAX}) — it has grown into a second body`,
          fix: `keep the ${MAX} that matter most; the rest is what the page body is for`,
        }));
      }
    }
    return out;
  },
};

export default rule;
