import { finding } from '../../engine/checks/helpers/findings.mjs';

// Converted from the leaflet prose: the tile provider's attribution is a LICENCE
// TERM, not decoration — an OSM-tiled map that ships without "© OpenStreetMap
// contributors" is using the tiles outside their terms. The prose names the exact
// failure mode: the attribution is dropped while *tidying the UI*, long after the
// map was wired, and nothing about the running map looks wrong afterwards. That
// makes it a static signature in the source — the `attribution` key on the
// `L.tileLayer(...)` options — so it converts.
//
// PARSED, NOT GREPPED (the skill's rule): `grep attribution` answers the wrong
// question — it is satisfied by the word appearing anywhere in the file, and it
// cannot tell WHICH tileLayer is missing it. So this reads each `L.tileLayer(`
// call site, walks its own argument list to the options object, and judges only
// that object's own top-level keys. Consequences, all deliberate:
//
//   - `L.tileLayer.wms(...)` is a different constructor and never matches.
//   - Options passed as a variable or built by a spread are NOT judged. The
//     literal is the only form where absence is provably absence; guessing at
//     the rest is how a check earns its false alarms.
//   - A file that calls `addAttribution` (Leaflet's documented out-of-band path —
//     `map.attributionControl.addAttribution(...)`) is skipped whole: there the
//     attribution legitimately lives away from the layer's options.
//   - Comments are blanked first, so prose that merely *names* the rule — this
//     header included, were it ever vendored as source — never fires it.
//
// Only the attribution half of the prose bullet converts. Its `maxZoom` sentence
// asks for the provider's REAL ceiling (19 for OSM), a per-provider value no
// check can judge, and Leaflet's own default is a legitimate answer for a map
// that never zooms that far — so that half stays prose.

const HTML = /\.html?$/i;
const SOURCE = /\.(html?|mjs|cjs|jsx?|tsx?)$/i;
const CALL = /\bL\.tileLayer\s*\(/g;
// The documented out-of-band path: attributionControl.addAttribution(...).
const OUT_OF_BAND = /\baddAttribution\s*\(/;

const blank = (s) => s.replace(/[^\n]/g, ' ');

// Length-preserving sibling of `stripComments`
// (engine/checks/helpers/code-scanning.mjs) — same string-aware state machine,
// but comment characters become spaces instead of vanishing. Offsets have to
// survive here because the scan reports a line number computed on the blanked
// text and, for HTML, splices script bodies back at their original positions.
function blankComments(source) {
  let out = '';
  let state = 'code'; // code | line | block | sq | dq | tpl
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const c2 = source[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; out += '  '; i++; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; out += '  '; i++; continue; }
      if (c === "'") state = 'sq';
      else if (c === '"') state = 'dq';
      else if (c === '`') state = 'tpl';
      out += c;
    } else if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; } else out += ' ';
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; out += '  '; i++; }
      else out += c === '\n' ? '\n' : ' ';
    } else {
      out += c;
      if (c === '\\') { out += c2 ?? ''; i++; }
      else if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
        state = 'code';
      }
    }
  }
  return out;
}

// The file reduced to the JS the browser actually runs, everything else blanked
// to spaces so offsets (and therefore line numbers) are unchanged. For HTML that
// is the inline `<script>` bodies only — markup and page text are not code, and a
// Leaflet snippet quoted in a `<pre>` is not a call site.
function codeView(file, raw) {
  if (!HTML.test(file)) return blankComments(raw);
  const noComments = raw.replace(/<!--[\s\S]*?-->/g, blank);
  let out = blank(noComments);
  const re = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (let m = re.exec(noComments); m; m = re.exec(noComments)) {
    const open = noComments.indexOf('>', m.index);
    if (open === -1) continue;
    const start = open + 1;
    const body = blankComments(m[1]);
    out = out.slice(0, start) + body + out.slice(start + body.length);
  }
  return out;
}

const CLOSERS = { '(': ')', '[': ']', '{': '}' };

// From `src[open]` (an opening bracket), return the index of its match, or -1.
// String- and template-aware so a bracket inside a URL or a caption never
// unbalances the walk.
function matchBracket(src, open) {
  const stack = [CLOSERS[src[open]]];
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === c) break;
      }
      continue;
    }
    if (CLOSERS[c]) stack.push(CLOSERS[c]);
    else if (c === ')' || c === ']' || c === '}') {
      if (stack[stack.length - 1] !== c) return -1;
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

// Split `src[from..to)` on commas that sit at this level — nested calls, arrays,
// objects and string literals are stepped over whole.
function splitTopLevel(src, from, to) {
  const parts = [];
  let start = from;
  for (let i = from; i < to; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < to; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === c) break;
      }
      continue;
    }
    if (CLOSERS[c]) {
      const end = matchBracket(src, i);
      if (end === -1 || end >= to) return null;
      i = end;
      continue;
    }
    if (c === ',') { parts.push(src.slice(start, i)); start = i + 1; }
  }
  parts.push(src.slice(start, to));
  return parts;
}

const KEY = /^\s*(?:(['"])([A-Za-z_$][\w$]*)\1|([A-Za-z_$][\w$]*))\s*:/;

// The object literal's own top-level keys, or null when any member is a spread
// (`...defaults`) — a spread can carry `attribution` in, so the literal no longer
// proves its absence and the call is left alone.
function topLevelKeys(src, open) {
  const close = matchBracket(src, open);
  if (close === -1) return null;
  const members = splitTopLevel(src, open + 1, close);
  if (members === null) return null;
  const keys = [];
  for (const member of members) {
    if (member.trim() === '') continue;
    if (member.trim().startsWith('...')) return null;
    const m = KEY.exec(member);
    if (!m) continue;
    keys.push(m[2] ?? m[3]);
  }
  return keys;
}

const rule = {
  id: 'leaflet/tile-attribution',
  severity: 'blocking',
  description: 'An L.tileLayer(...) built with a literal options object carries the tile provider\'s attribution',
  doc: 'packs/leaflet/RULES.md',
  why: 'the provider\'s attribution is a licence term, not decoration — an unattributed tile layer uses the tiles outside their terms, and nothing about the running map looks wrong, so a UI tidy-up drops it and no one notices',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!SOURCE.test(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('L.tileLayer')) continue;
      const src = codeView(file, raw);
      if (OUT_OF_BAND.test(src)) continue;

      CALL.lastIndex = 0;
      for (let m = CALL.exec(src); m; m = CALL.exec(src)) {
        const open = m.index + m[0].length - 1;
        const close = matchBracket(src, open);
        if (close === -1) continue;
        const args = splitTopLevel(src, open + 1, close);
        if (args === null) continue;

        const options = (args[1] ?? '').trim();
        if (args.length > 1) {
          // Not a literal — options come from a variable, a call, or a spread we
          // cannot see into. Absence here is not provable, so it is not judged.
          if (!options.startsWith('{')) continue;
          // Where args[1]'s own text begins in `src`, past its leading blanks.
          const objStart = open + 1 + args[0].length + 1
            + (args[1].length - args[1].trimStart().length);
          const keys = topLevelKeys(src, objStart);
          if (keys === null || keys.includes('attribution')) continue;
        }

        out.push(finding(rule, {
          file,
          line: src.slice(0, m.index).split('\n').length,
          what: args.length > 1
            ? 'builds an L.tileLayer with a literal options object that has no `attribution`'
            : 'builds an L.tileLayer with no options at all, so no `attribution`',
          fix: 'add attribution to this layer\'s options — e.g. attribution: \'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors\' — or, where the credit is genuinely supplied elsewhere, register it through map.attributionControl.addAttribution(...)',
        }));
      }
    }
    return out;
  },
};

export default rule;
