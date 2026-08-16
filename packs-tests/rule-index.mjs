// The rule index a pack README carries: one row per rule in the pack's
// RULES.md, each row stating that rule's word count, the severity of ignoring
// it and the reason it exists (packs/README.md#the-rule-index-a-pack-readme-carries).
//
// Word count is derived data, so it is computed here and compared against the
// README by rule-index.test.mjs rather than hand-maintained in the two dozen
// pack READMEs whose prose is appended to several times a week.

// The two closed vocabularies a row's Severity and Reason cells are drawn from,
// spelled once here and described in packs/README.md.
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const REASONS = ['correctness', 'performance', 'complexity', 'legal'];

const RULE_BULLET = /^- \*\*/;
const HEADING = /^(#{2,})\s+(.+?)\s*$/;
// A rule's lead-in is bolded, and long ones wrap, so the closing ** may sit
// several lines below the bullet marker.
const LEAD_IN = /\*\*([\s\S]+?)\*\*/;

const wordsIn = (lines) => lines.join('\n').split(/\s+/).filter(Boolean).length;

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

// The README's own index: the rows of the first table whose header carries a
// Words column. Rows are held against RULES.md by position — the index lists
// the rules in the order the prose does — so a row's label stays a human
// summary rather than a second copy of the rule's lead-in.
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
      inIndex = cells.some((c) => /^words$/i.test(c));
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push({ label: cells[0], words: Number(cells[1]), severity: cells[2], reason: cells[3] });
  }
  return rows;
}
