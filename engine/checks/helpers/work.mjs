import { dirname, join, normalize } from 'node:path';
import { humanTurns, assistantTextAfter, classificationLine, classesIn } from './session-transcript.mjs';
import { addedLines } from './line-scanning.mjs';
import { extractLinks } from './markdown.mjs';

// The fluent check-the-work surface over ctx. Every accessor is null-safe — no
// transcript, no merge-base, an empty branch all yield empty results — so a rule
// reads as one chain with no guard ladders. Mechanism only: a rule still owns
// its patterns, file filters, and failure text.
export const work = (ctx) => new Work(ctx);

// Null-object for "no such turn": every accessor answers emptily, so a chain
// ending in .last() never needs an existence guard before its predicates.
const NO_TURN = {
  exists: false, text: '', timestamp: null,
  excerpt: () => '', reply: () => '', classified: () => false,
  classes: () => new Set(), time: () => 0,
};

class Turn {
  constructor(entries, { index, timestamp, text }) {
    this.entries = entries;
    this.index = index;
    this.timestamp = timestamp;
    this.text = text;
    this.exists = true;
  }

  excerpt(n) { return this.text.replace(/\s+/g, ' ').slice(0, n); }
  reply() { return assistantTextAfter(this.entries, this.index); }
  classified() { return classificationLine(this.reply()) !== null; }
  classes() { return classesIn(classificationLine(this.reply())); }
  time() { return Date.parse(this.timestamp ?? '') || 0; }
}

// Array subclass so filter/map stay chainable and .last() survives them.
class Turns extends Array {
  last() { return this.length ? this[this.length - 1] : NO_TURN; }
}

class Conversation {
  constructor(entries) { this.entries = entries ?? []; }

  ownerTurns() {
    const turns = new Turns();
    for (const t of humanTurns(this.entries)) turns.push(new Turn(this.entries, t));
    return turns;
  }
}

class Work {
  constructor(ctx) { this.ctx = ctx; }

  conversation() { return new Conversation(this.ctx.conversation()); }

  addedLines(files) { return addedLines(this.ctx, files ?? this.ctx.changedFiles); }

  onDefaultBranch() { return this.ctx.branch === 'main' || this.ctx.branch === 'master'; }

  introducedMerges() { return this.ctx.introducedMergeCommits(); }

  // Branch commits since the merge-base, oldest first, each with a parsed .time.
  branchCommits() {
    return this.ctx.commitsWithFiles().map((c) => ({ ...c, time: Date.parse(c.date) || 0 }));
  }

  // `file` parsed as JSON at head and at the scoping base; a side that is
  // absent or unparsable is null, so set-vs-base rules need no try/catch.
  jsonPair(file) {
    const parse = (text) => {
      if (text === null) return null;
      try { return JSON.parse(text); } catch { return null; }
    };
    return { head: parse(this.ctx.read(file)), base: parse(this.ctx.readBase(file)) };
  }

  filesContaining(needle, files = this.ctx.files) {
    return files.filter((f) => (this.ctx.read(f) ?? '').includes(needle));
  }

  // Relative Markdown links that resolve to nothing: [{ file, line, target, resolved }].
  // Links reaching outside the repo aren't verifiable here and are skipped.
  deadLinks(files) {
    const out = [];
    for (const file of (files ?? this.ctx.files).filter((f) => f.endsWith('.md'))) {
      const text = this.ctx.read(file);
      if (text === null) continue;
      for (const { target, line } of extractLinks(text)) {
        const resolved = normalize(join(dirname(file), target));
        if (resolved.startsWith('..') || this.ctx.exists(resolved)) continue;
        out.push({ file, line, target, resolved });
      }
    }
    return out;
  }

  // Tracked lines still naming a path this change deletes: [{ file, line, text, gone }].
  // A hit whose every occurrence widens to a path token that still resolves is a
  // rename that kept the basename, not a dangling reference — dropped. `tolerated(gone)`
  // lets the rule exempt paths something else deliberately governs.
  danglingReferences(tolerated = () => false) {
    const out = [];
    for (const gone of this.ctx.deleted) {
      if (tolerated(gone)) continue;
      for (const hit of this.ctx.grepTracked(gone)) {
        if (hit.file === gone || referencesSurvivingPath(hit, gone, this.ctx)) continue;
        out.push({ ...hit, gone });
      }
    }
    return out;
  }
}

const PATH_CHAR = /[\w./@-]/;

function widenToken(text, start, end) {
  let s = start;
  let e = end;
  while (s > 0 && PATH_CHAR.test(text[s - 1])) s--;
  while (e < text.length && PATH_CHAR.test(text[e])) e++;
  return text.slice(s, e);
}

function referencesSurvivingPath(hit, gone, ctx) {
  let idx = hit.text.indexOf(gone);
  if (idx === -1) return false;
  while (idx !== -1) {
    const token = widenToken(hit.text, idx, idx + gone.length);
    const resolved = normalize(join(dirname(hit.file), token));
    if (!((token !== gone && ctx.exists(token)) || ctx.exists(resolved))) return false;
    idx = hit.text.indexOf(gone, idx + 1);
  }
  return true;
}
