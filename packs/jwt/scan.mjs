// Shared scanning surface for the jwt pack's skill checks — the file-set policy
// and the call-window walker every rule composes. Pack-local on purpose: the
// engine's helpers stay content-blind, while what counts as "a JWT source file"
// is exactly this pack's policy, stated once so five rules cannot drift on it.

// The languages the rules read. Tests and fixtures are excluded everywhere: a
// test hardcoding a secret or a forbidden algorithm list is exercising the
// hazard, not shipping it (the corpus's own fixtures ride this same exemption).
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx|py)$/;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|fixtures)\/|\.(test|spec)\.[a-z]+$|_test\.py$/;
// This pack's own tree (canon checkout or vendored mount): rule modules and
// their tests quote the very patterns they hunt, so they never self-flag.
const PACK_SELF = /(^|\/)(packs|packs-tests)\/jwt\//;

// The in-scope files: project source, no tests, not this pack itself.
export function sourceFiles(ctx) {
  return ctx.files.filter((f) => SOURCE.test(f) && !TEST_PATH.test(f) && !PACK_SELF.test(f));
}

// Every call site in `text` whose opener matches `callRe` (a regex ending at
// the call's open paren), returned as { line, window }: the window runs from
// the match to the call's balanced closing paren, capped at 2000 chars so a
// pathological file cannot stall the sweep. Balance-counting ignores strings —
// a paren inside a literal can cut a window short, which only ever makes a
// rule QUIETER (a truncated window is judged against its whole file too).
export function callWindows(text, callRe) {
  const out = [];
  const re = new RegExp(callRe.source, callRe.flags.includes('g') ? callRe.flags : `${callRe.flags}g`);
  for (const m of text.matchAll(re)) {
    const open = text.indexOf('(', m.index);
    if (open === -1) continue;
    let depth = 0;
    let end = Math.min(text.length, open + 2000);
    for (let i = open; i < open + 2000 && i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) { end = i + 1; break; }
    }
    out.push({ line: text.slice(0, m.index).split('\n').length, window: text.slice(m.index, end) });
  }
  return out;
}
