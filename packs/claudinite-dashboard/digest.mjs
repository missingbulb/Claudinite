// The fleet's morning brief, as the dashboard reads it. Pure: no clock, no I/O, no DOM.
//
// This pack's own `fleet-digest` task writes one file per day at `digests/<date>.md`
// in the fleet enforcer's repo — the few things the fleet actually accomplished, and the
// project worth returning to. Nothing surfaced it until now, and the dashboard is
// where someone is already looking.
//
// IT IS PLAIN TEXT, NOT MARKDOWN, despite the `.md` name. That is the task's own
// contract and a check enforces it over the landed series: the brief is read out
// verbatim through a renderer that parses no markdown and keeps no line breaks, so it
// carries no headings, no bullet syntax, no bold and no link syntax — a `• ` opens
// each item and every URL sits bare. So the right reader here is NOT a Markdown
// library: it is a few rules over lines, which is also the smallest honest thing the
// page can do with a file whose shape is fixed.
//
// The forgiving half — a `#` heading or a `- ` bullet is accepted anyway — costs three
// lines and means a hand-written or older brief still renders as prose rather than as
// a wall with stray punctuation.

const DAY_MS = 86400e3;

// Which days to show: yesterday and the day before. Today is deliberately not among
// them — the brief for a day is written after that day, so today's file does not exist
// yet and asking for it would spend a request to learn nothing.
export function digestDates(now, count = 2) {
  const midnight = Math.floor(now / DAY_MS) * DAY_MS;
  return Array.from({ length: count }, (_, i) => new Date(midnight - (i + 1) * DAY_MS).toISOString().slice(0, 10));
}

export const digestPath = (dir, date) => `${String(dir ?? 'digests').replace(/^\/|\/$/g, '')}/${date}.md`;

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:]/g;

// A line, split into the text and link runs a renderer can build nodes from. Bare URLs
// are the brief's only link form, because that is the only one its writer is allowed.
export function linkRuns(line) {
  const out = [];
  let at = 0;
  for (const m of String(line).matchAll(URL_RE)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push({ text: m[0], href: m[0] });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}

// The brief as blocks. Four kinds, which is all its shape has:
//
//   title    the first line, naming the fleet and the day
//   section  a line that ends in a colon — "Yesterday's biggest work:"
//   item     a bulleted accomplishment
//   para     anything else, which is the nudge's closing sentence
export function parseDigest(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const blocks = [];
  let seenTitle = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const bullet = /^([•*-]|\d+\.)\s+/.exec(line);
    if (bullet) {
      blocks.push({ kind: 'item', runs: linkRuns(line.slice(bullet[0].length)) });
      continue;
    }

    const heading = /^#{1,6}\s+/.exec(line);
    const body = heading ? line.slice(heading[0].length) : line;

    if (!seenTitle) {
      seenTitle = true;
      blocks.push({ kind: 'title', runs: linkRuns(body) });
      continue;
    }
    if (heading || /:$/.test(body)) {
      blocks.push({ kind: 'section', runs: linkRuns(body.replace(/:$/, '')) });
      continue;
    }
    blocks.push({ kind: 'para', runs: linkRuns(body) });
  }
  return blocks;
}

// What the page knows about one day's brief. A missing file is a NORMAL state — the
// task had nothing to report, or has not run yet — and it is carried as `missing`
// with no error attached, because a day without a brief is not a fault to report.
export function digestEntry(date, text, error = null) {
  if (error) return { date, text: null, state: 'unreadable', error, blocks: [] };
  if (text == null) return { date, text: null, state: 'missing', error: null, blocks: [] };
  const blocks = parseDigest(text);
  return { date, text, state: blocks.length ? 'written' : 'empty', error: null, blocks };
}
