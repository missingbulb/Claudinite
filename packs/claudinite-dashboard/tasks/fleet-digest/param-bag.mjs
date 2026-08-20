// The operator's PARAMETERS for a forced run of this task, out of the work item's
// Context. A copy of the claudinite-fleet-sheepdog pack's `param-bag.mjs`, for the same reason
// `fleet-reads.mjs` is one: two independently-adopted packs must not import each
// other, and the parser is twenty lines of a format the queue defines.
//
// WHERE THEY COME FROM. A forced run is an item created by hand —
// `create-work-item claudinite-dashboard/fleet-digest --context "DAYS=3"` — and the
// executor hands that item's Context to code-work as `CLAUDINITE_CONTEXT`, one line per
// bullet. So this is the whole channel: no workflow input, no override box.
//
// WHY A FILTER AND NOT A SPLIT. Context is BINDING SCOPE first and parameters second:
// an item is born carrying prose (the scheduler run's birth note, a precondition's reason), so
// a token counts as a parameter only when it looks like one — a SHOUTING key,
// optionally with a value — and everything else is scope for the agent to read.
//
// Values stay STRINGS with no truthiness coercion, so a task compares against the
// literal it documents. A bare key means `'true'`. Tokens split on commas as well as
// newlines, so a VALUE may not contain a comma.
const KEY = /^[A-Z][A-Z0-9_]*$/;

export function parseParamBag(raw) {
  const out = {};
  for (const part of String(raw ?? '').split(/[,\n]/)) {
    const token = part.trim();
    if (!token) continue;
    const eq = token.indexOf('=');
    const key = (eq === -1 ? token : token.slice(0, eq)).trim();
    if (!KEY.test(key)) continue;
    out[key] = eq === -1 ? 'true' : token.slice(eq + 1).trim();
  }
  return out;
}

// The raw Context text a code-work subprocess is handed.
export const contextText = (env = process.env) => env.CLAUDINITE_CONTEXT ?? '';
