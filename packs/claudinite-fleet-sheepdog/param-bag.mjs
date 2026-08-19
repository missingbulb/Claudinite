// The operator's PARAMETERS for a forced run of a claudinite-fleet-sheepdog task, out of the work
// item's Context.
//
// WHERE THEY COME FROM. A forced run is an item created by hand —
// `create-work-item claudinite-fleet-sheepdog/fleet-baseline --context "REPOS=Alpha Beta"` — and
// the executor hands that item's Context to code-work as `CLAUDINITE_CONTEXT`, one
// line per bullet. So this is the whole channel: no workflow input, no free-form
// override box, nothing the queue does not already carry.
//
// WHY A FILTER AND NOT A SPLIT. Context is BINDING SCOPE first and parameters
// second: an item is born carrying prose (the tick's birth note, a precondition's
// reason), and every scheduled occurrence of these same tasks carries prose alone.
// So a token counts as a parameter only when it looks like one — a SHOUTING key,
// optionally with a value — and everything else is scope for the agent to read and
// is silently not a parameter here. Splitting the whole text into keys instead
// would turn the first sentence of a birth note into half a dozen of them.
//
// Values stay STRINGS with no truthiness coercion: a task compares against the
// literal it documents, so `DRY_RUN=false` can never read as "the key is present,
// therefore on". A bare key means `'true'`.
//
// Tokens split on commas as well as newlines, so a VALUE may not contain a comma —
// the list parameters are space-separated for exactly that reason.
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

// The raw Context text a code-work subprocess is handed. Named here rather than
// read inline in each worker so the three tasks cannot disagree about which
// variable carries it.
export const contextText = (env = process.env) => env.CLAUDINITE_CONTEXT ?? '';
