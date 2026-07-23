import { dirname, join, normalize } from 'node:path';
import { humanTurns, assistantTextAfter, classificationLine, classesIn, toolUses, toolResults } from './session-transcript.mjs';
import { addedLines } from './line-scanning.mjs';
import { extractLinks } from './markdown.mjs';

// The fluent check-the-work surface over ctx. Every accessor is null-safe — no
// transcript, no merge-base, an empty branch all yield empty results — so a rule
// reads as one chain with no guard ladders. Mechanism only: a rule still owns
// its patterns, file filters, and failure text.
//
// A rule declaring `scope: 'work'` receives this object as its `run` argument
// (runRule dispatches); check-the-world rules keep the raw ctx until a fluent
// world object exists. The raw surface a work rule still needs (files, read,
// exists, …) is delegated here, so a work rule — and the structural helpers it
// calls, e.g. findExtensionManifest — never touches ctx itself.
export const work = (ctx) => new Work(ctx);

// The single dispatch seam: the runner and every rule test invoke rules through
// this, so a rule's scope decides its context in exactly one place. Extra args
// pass through (some rules take test-only options after the context).
export const runRule = (rule, ctx, ...args) => rule.run(rule.scope === 'work' ? work(ctx) : ctx, ...args);

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

const GH_PREFIX = 'mcp__github__';
const PLAN_LABEL = 'plan-tracking';
const CHECKED_BOX = /-\s*\[x\]/i; // a maintained checklist has at least one checked item

class Conversation {
  constructor(entries) { this.entries = entries ?? []; }

  ownerTurns() {
    const turns = new Turns();
    for (const t of humanTurns(this.entries)) turns.push(new Turn(this.entries, t));
    return turns;
  }

  // GitHub MCP tool calls, base-named (mcp__github__X → X), each with a parsed
  // .time (ms) — the offline record of what this session did on GitHub.
  githubCalls() {
    return toolUses(this.entries)
      .filter((u) => u.name.startsWith(GH_PREFIX))
      .map((u) => ({ ...u, tool: u.name.slice(GH_PREFIX.length), time: Date.parse(u.timestamp ?? '') || 0 }));
  }

  // PR merges this session accepted: [{ pr, time }], oldest first.
  merges() {
    return this.githubCalls()
      .filter((c) => c.tool === 'merge_pull_request')
      .map((c) => ({ pr: c.input?.pullNumber ?? null, time: c.time }))
      .sort((a, b) => a.time - b.time);
  }

  // Issue numbers this session observed to carry the `plan-tracking` label —
  // read from a list_issues/search_issues call FILTERED by the label (the numbers
  // its result returns are all plan-tracking), plus any issue the session itself
  // labeled plan-tracking. Transcript-only label evidence, per the design's
  // no-credential-in-session constraint: a session that never consulted the
  // tracker leaves none, and the rule self-skips (a documented offline blind spot).
  planTrackingIssues() {
    const nums = new Set();
    const resultById = new Map();
    for (const r of toolResults(this.entries)) if (r.toolUseId) resultById.set(r.toolUseId, r.text);
    for (const c of this.githubCalls()) {
      const labels = Array.isArray(c.input?.labels) ? c.input.labels : [];
      const query = typeof c.input?.query === 'string' ? c.input.query : '';
      const filtersLabel = labels.includes(PLAN_LABEL) || /label:\s*"?plan-tracking"?/i.test(query);
      if (filtersLabel && (c.tool === 'list_issues' || c.tool === 'search_issues')) {
        for (const m of (resultById.get(c.id) ?? '').matchAll(/"number"\s*:\s*(\d+)/g)) nums.add(Number(m[1]));
      }
      if (c.tool === 'issue_write' && labels.includes(PLAN_LABEL) && Number.isInteger(c.input?.issue_number)) {
        nums.add(Number(c.input.issue_number));
      }
    }
    return nums;
  }

  // issue_write UPDATE calls after `since` whose body carries a checked box, by
  // issue number: [{ issue, time }] — the "checklist was brought in sync" signal.
  checklistUpdatesAfter(since) {
    return this.githubCalls()
      .filter((c) => c.tool === 'issue_write' && c.input?.method === 'update' && c.time > since)
      .filter((c) => CHECKED_BOX.test(String(c.input?.body ?? '')))
      .map((c) => ({ issue: Number(c.input?.issue_number), time: c.time }));
  }
}

class Work {
  constructor(ctx) { this.ctx = ctx; }

  get branch() { return this.ctx.branch; }
  get baseRef() { return this.ctx.baseRef; }
  get commits() { return this.ctx.commits; }
  get files() { return this.ctx.files; }
  get changedFiles() { return this.ctx.changedFiles; }
  get tracked() { return this.ctx.tracked; }
  read(path) { return this.ctx.read(path); }
  exists(path) { return this.ctx.exists(path); }
  packConfig(id) { return this.ctx.config?.packConfig?.[id]; }

  conversation() { return new Conversation(this.ctx.conversation()); }

  // The PRs this session accepted, from the transcript's merge_pull_request calls:
  // [{ pr, time }], oldest first. The offline "accepted PRs from the current
  // session" primitive — empty without a transcript (CI, manual run) or when no
  // merge happened, so a post-merge rule self-skips by reading it.
  mergedThisSession() { return this.conversation().merges(); }

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
