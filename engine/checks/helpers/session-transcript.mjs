// Session-transcript parsing for conversation-surface rules (Stop hook only —
// CI has no transcript, so rules must return [] when ctx.conversation() is null).
// A Claude Code transcript is JSONL; the shapes this reads were verified against
// a real session file, not inferred: an owner turn is `type: "user"` with plain
// string message content (tool results arrive as content arrays, injected/meta
// turns carry isMeta, subagent traffic carries isSidechain, and synthetic turns
// — hook output, reminders, webhook activity — are tag-wrapped, starting with "<").

export function parseEntries(text) {
  const entries = [];
  for (const line of (text || '').split('\n')) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { /* partial trailing write — skip the line */ }
  }
  return entries;
}

function humanText(entry) {
  if (entry.type !== 'user' || entry.isMeta || entry.isSidechain) return null;
  const content = entry.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content) && content.length && content.every((c) => c?.type === 'text')
      ? content.map((c) => c.text).join('\n')
      : null;
  if (!text || text.trimStart().startsWith('<')) return null;
  return text;
}

// The owner's own turns, in order: [{ index, timestamp, text }].
export function humanTurns(entries) {
  const turns = [];
  entries.forEach((entry, index) => {
    const text = humanText(entry);
    if (text !== null) turns.push({ index, timestamp: entry.timestamp ?? null, text });
  });
  return turns;
}

// Concatenated assistant text emitted after entry `fromIndex`, up to the next
// owner turn (or the end of the session).
export function assistantTextAfter(entries, fromIndex) {
  const parts = [];
  for (let i = fromIndex + 1; i < entries.length; i += 1) {
    const entry = entries[i];
    if (humanText(entry) !== null) break;
    if (entry.type !== 'assistant') continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'text' && block.text) parts.push(block.text);
    }
  }
  return parts.join('\n');
}

// The explicit classification line, if the reply carries one.
export function classificationLine(text) {
  const m = /^[ \t>#*_-]*comment\s+class\b[^:\n]*:(.*)$/im.exec(text || '');
  return m ? m[0] : null;
}

// Canonical class tokens named on a classification line (a mixed comment may
// name several): 'correction' | 'feature' | 'process-change' | 'other'.
export function classesIn(line) {
  const classes = new Set();
  for (const m of (line || '').matchAll(/correction|feature|process[\s-]change|other/gi)) {
    classes.add(m[0].toLowerCase().replace(/\s+/g, '-'));
  }
  return classes;
}

// Assistant tool-use calls, in order: [{ index, timestamp, id, name, input }].
// MCP tool calls are the only record a transcript holds that a session touched
// GitHub (a merge, an issue update) — in-session code carries no REST credential
// (the blocking in-session-github-access rule), so the transcript is the sole
// offline evidence a post-merge rule can read. Sidechain (subagent) traffic is
// excluded: only the main agent's own actions count.
export function toolUses(entries) {
  const uses = [];
  entries.forEach((entry, index) => {
    if (entry.type !== 'assistant' || entry.isSidechain) return;
    const content = entry.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (block?.type === 'tool_use' && typeof block.name === 'string') {
        uses.push({ index, timestamp: entry.timestamp ?? null, id: block.id ?? null, name: block.name, input: block.input ?? {} });
      }
    }
  });
  return uses;
}

// Tool results, in order: [{ index, timestamp, toolUseId, text }]. A result is a
// `user` entry carrying a tool_result block; its payload is a plain string or an
// array of text parts (the Anthropic tool_result shapes), so `text` is their
// concatenation and a rule scans it without knowing which form arrived. Defensive:
// an unrecognized shape yields '' rather than throwing. Sidechain/meta excluded.
export function toolResults(entries) {
  const out = [];
  entries.forEach((entry, index) => {
    if (entry.type !== 'user' || entry.isSidechain || entry.isMeta) return;
    const content = entry.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (block?.type !== 'tool_result') continue;
      const c = block.content;
      const text = typeof c === 'string'
        ? c
        : Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('') : '';
      out.push({ index, timestamp: entry.timestamp ?? null, toolUseId: block.tool_use_id ?? null, text });
    }
  });
  return out;
}

// Each owner turn with the classes its reply declared (empty set = unclassified).
export function classifiedTurns(entries) {
  return humanTurns(entries).map((turn) => ({
    ...turn,
    classes: classesIn(classificationLine(assistantTextAfter(entries, turn.index))),
  }));
}
