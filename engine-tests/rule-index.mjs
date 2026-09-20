// The rule index a pack README carries: one row per rule in the pack's
// RULES.md, each row stating that rule's length, the severity of ignoring
// it and the reason it exists (packs/README.md#the-rule-index-a-pack-readme-carries).
//
// A rule's length is derived data, so it is computed here and compared against
// the README by rule-index.test.mjs rather than hand-maintained in the two dozen
// pack READMEs whose prose is appended to several times a week. The row states
// the size BAND rather than the count, because nothing reads the digit: the
// session-start summary counts the prose itself and no other reader opens this
// index, so an exact figure only bought a red build every time a rule moved by
// one word (#2006).

// The two closed vocabularies a row's Severity and Reason cells are drawn from,
// spelled once here and described in packs/README.md.
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const REASONS = ['correctness', 'performance', 'complexity', 'legal'];

// The ladder a rule's length is reported on: an upper bound per rung, and an
// open top so no length is unclassifiable. The corpus reaches ~200 words today,
// so the last two rungs stand empty — kept because a rule that grows past 200
// should find its rung already there rather than force a change to this ladder.
export const SIZE_BOUNDS = [20, 50, 100, 200, 500];
export const SIZES = [...SIZE_BOUNDS.map((n) => `<${n}`), `${SIZE_BOUNDS.at(-1)}+`];

export function proseSize(words) {
  const bound = SIZE_BOUNDS.find((n) => words < n);
  return bound ? `<${bound}` : `${SIZE_BOUNDS.at(-1)}+`;
}

const RULE_BULLET = /^- \*\*/;
const HEADING = /^(#{2,})\s+(.+?)\s*$/;
// A rule's lead-in is bolded, and long ones wrap, so the closing ** may sit
// several lines below the bullet marker.
const LEAD_IN = /\*\*([\s\S]+?)\*\*/;

// The marker that ends a rule and names its provenance file is an id, not prose: it
// is not counted, so marking a rule never moves its band. It ends the rule's lead
// paragraph, which a nested list or a fenced block may follow, so it is read at any
// line's end and not only the block's.
const PROVENANCE_MARKER = /\s*\([a-z][a-z0-9]*(?:-[a-z0-9]+)+\)\s*$/gm;
const wordsIn = (lines) => lines.join('\n').replace(PROVENANCE_MARKER, '').split(/\s+/).filter(Boolean).length;

const trimTrailingBlanks = (lines) => {
  const out = [...lines];
  while (out.length && !out.at(-1).trim()) out.pop();
  return out;
};

// A rule block is a top-level `- **Lead-in**` bullet plus its continuation
// lines. A pack whose RULES.md carries no such bullet (its rules are written as
// sections) is indexed by heading instead; a pack with neither has no
// enumerable rules and carries no index.
export function ruleBlocks(markdown) {
  const lines = markdown.split('\n');
  const byBullet = collect(lines, (line) => RULE_BULLET.test(line));
  if (byBullet.length) return byBullet;
  return collect(lines, (line) => HEADING.test(line));
}

function collect(lines, startsBlock) {
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (startsBlock(line)) {
      current = [line];
      blocks.push(current);
    } else if (current) {
      // A heading closes the block above it: the text under it belongs to the
      // next rule, or to no rule at all.
      if (HEADING.test(line)) current = null;
      else current.push(line);
    }
  }
  return blocks.map((body) => {
    const trimmed = trimTrailingBlanks(body);
    const text = trimmed.join('\n');
    const bold = LEAD_IN.exec(text);
    const heading = HEADING.exec(trimmed[0]);
    return {
      leadIn: normalizeLeadIn(heading ? heading[2] : bold ? bold[1] : trimmed[0]),
      words: wordsIn(trimmed),
    };
  });
}

// A lead-in is a sentence fragment carrying inline markup and, where it wraps,
// newlines; this is the form a reader would compare two spellings of it in.
export function normalizeLeadIn(text) {
  return text.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/[—–-]$/, '').trim();
}

// The README's own index: the rows of the first `| Rule | Severity | Reason |
// Enforcement |` table, whose Enforcement cell states the rule's size band
// ("prose: <100 words", plus the check that also carries it). Rows are held
// against RULES.md by position — the index lists the rules in the order the
// prose does — so a row's label stays a human summary rather than a second copy
// of the rule's lead-in.
export function readmeRuleIndex(readme) {
  const rows = [];
  let inIndex = false;
  for (const line of readme.split('\n')) {
    if (!line.startsWith('|')) {
      if (inIndex) break;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!inIndex) {
      inIndex = /^rule$/i.test(cells[0]) && /^enforcement$/i.test(cells.at(-1));
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push({
      label: cells[0],
      severity: cells[1],
      reason: cells[2],
      size: /prose: (<\d+|\d+\+) words/.exec(cells[3])?.[1],
    });
  }
  return rows;
}
