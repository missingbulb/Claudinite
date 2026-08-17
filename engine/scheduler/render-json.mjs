// How a GENERATED JSON file is written out: structure expanded, ROWS INLINE.
//
// `JSON.stringify(value, null, 2)` gives one scalar per line, which for a file whose
// leaves are counter tuples means a 7-number row costs 9 lines and ~120 bytes of
// punctuation. This renderer keeps the same bytes-in-bytes-out contract as
// `JSON.stringify` — parse the output and you get the input back — and spends its
// newlines only where they buy something: a container is expanded when its one-line
// form would run past `width`, and inlined when it fits.
//
// The consequence worth naming, because it is why this exists rather than a flag on
// the caller: the resulting diff is one changed line per changed ROW, not per changed
// number, which is the grain a reviewer of a regenerated aggregate actually reads.
//
// Keys are emitted in insertion order, exactly as `JSON.stringify` does — sorting is
// the caller's job, before it gets here.

// The one-line form. Object entries whose value cannot appear in JSON at all
// (`undefined`, a function) are dropped, matching `JSON.stringify`'s own treatment;
// inside an ARRAY the same values become `null`, again matching it.
function inline(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  return `{${entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')}}`;
}

const entries = (obj) => Object.entries(obj).filter(([, v]) => v !== undefined && typeof v !== 'function');

// Render `value` as JSON text with no trailing newline. `width` is the budget for a
// whole LINE: the indent, whatever the caller has already put on it (an object key,
// counted through `lead`), and the value's own one-line form. A container that does
// not fit is expanded one child per line and each child re-measured the same way.
export function renderJson(value, { width = 100, indent = '', lead = 0 } = {}) {
  const flat = inline(value);
  if (value === null || typeof value !== 'object' || indent.length + lead + flat.length <= width) return flat;
  const inner = `${indent}  `;
  const children = Array.isArray(value)
    ? value.map((v) => `${inner}${renderJson(v, { width, indent: inner })}`)
    : entries(value).map(([k, v]) => {
      const key = `${JSON.stringify(k)}: `;
      return `${inner}${key}${renderJson(v, { width, indent: inner, lead: key.length })}`;
    });
  // An empty container is its own one-line form; it only reaches here when `width` is
  // absurdly small, and `{\n\n}` would not be valid JSON.
  if (children.length === 0) return flat;
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${children.join(',\n')}\n${indent}${close}`;
}

// The whole file: rendered, newline-terminated, ready to hand to `deliverGenerated`.
export function renderJsonFile(value, options) {
  return `${renderJson(value, options)}\n`;
}
