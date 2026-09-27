// A pack's fingerprint as data: which tracked paths suggest the pack, and optionally
// what one of those files must contain. Because it is data rather than a function,
// every reader evaluates the same spec its own way: a session over its checkout, the
// fleet sweep over a member's tree listing, a dashboard in a browser over GitHub's API,
// which can narrow the text half with a code search for the `search` terms before
// reading anything. A locate only suspects a pack is wanted; declaring it is the
// project's call.
//
//   about   what a person reads: the thing found, in words
//   paths   a RegExp tested against each tracked path
//   text    optional RegExp, or list of them, every one matching the same file
//   search  code-search terms, required with `text`: a file `text` matches contains
//           at least one of them, so a search for any of them finds every candidate
//
// No filesystem and no imports, so a browser can load it as it is.

// GitHub's code search refuses a query with more than five AND/OR/NOT operators, and
// the terms are joined with OR into one query.
export const MAX_SEARCH_TERMS = 6;

const KEYS = new Set(['about', 'paths', 'text', 'search']);
const isPattern = (v) => v instanceof RegExp;
const patterns = (text) => (text === undefined ? [] : [].concat(text));

// A `g` or `y` pattern keeps state between `.test` calls, so the second file tested
// could fail on what the first left behind.
const stateless = (r) => !/[gy]/.test(r.flags);

export function validateLocate(locate) {
  if (locate === null) return [];
  if (typeof locate !== 'object' || Array.isArray(locate)) return ['locate is an object or null'];
  const errors = [];
  for (const key of Object.keys(locate)) if (!KEYS.has(key)) errors.push(`locate declares "${key}", which is not one of ${[...KEYS].join(', ')}`);
  if (typeof locate.about !== 'string' || !locate.about.trim()) errors.push('locate.about names what is found, in words');
  if (!isPattern(locate.paths)) errors.push('locate.paths is a RegExp over tracked paths');
  const text = patterns(locate.text);
  if (!text.every(isPattern)) errors.push('locate.text is a RegExp or a list of them');
  const all = [locate.paths, ...text].filter(isPattern);
  if (!all.every(stateless)) errors.push('a locate pattern carries the g or y flag, which makes .test stateful');
  if (text.length && !(Array.isArray(locate.search) && locate.search.length && locate.search.every((s) => typeof s === 'string' && s.trim()))) {
    errors.push('locate.search lists the code-search terms that find every file locate.text matches');
  }
  if (Array.isArray(locate.search) && locate.search.length > MAX_SEARCH_TERMS) {
    errors.push(`locate.search names ${locate.search.length} terms; one code search joins at most six`);
  }
  return errors;
}

export const locateCandidates = (locate, tracked) => tracked.filter((f) => locate.paths.test(f));

export function locateMatches(locate, ctx) {
  if (!locate) return false;
  const text = patterns(locate.text);
  return ctx.tracked.some((f) => {
    if (!locate.paths.test(f)) return false;
    if (!text.length) return true;
    const body = ctx.read(f);
    return body !== null && text.every((r) => r.test(body));
  });
}

const patternData = (r) => ({ source: r.source, flags: r.flags });

// The spec with every pattern as { source, flags }: what a reader outside this
// runtime, or across a JSON boundary, rebuilds with `new RegExp(source, flags)`.
export function locateData(locate) {
  if (!locate) return null;
  return {
    about: locate.about,
    paths: patternData(locate.paths),
    ...(locate.text !== undefined ? { text: patterns(locate.text).map(patternData) } : {}),
    ...(locate.search ? { search: [...locate.search] } : {}),
  };
}
