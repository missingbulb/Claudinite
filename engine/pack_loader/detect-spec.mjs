// A pack's fingerprint AS DATA — the `detect` form most packs need.
//
// Almost every fingerprint in the corpus is one question about the repo's
// tracked paths: is `template.yaml` there, does anything end in
// `ios/Runner/Info.plist`, is there a `pubspec.yaml` at the root or one
// directory down. Written as code those were one-line arrow functions the loader
// had to EXECUTE at every session start, in every consumer, to answer. Written
// as data they are a line of JSON the loader reads.
//
// The vocabulary is deliberately small and closed (pack.schema.json holds the
// shape): a fingerprint that cannot be said in it — one that reads file CONTENT,
// or parses a manifest to find another file — declares a `detect.mjs` sibling
// instead and keeps its logic honestly as logic. Growing this vocabulary to
// swallow those would rebuild a predicate language in JSON, which is worse than
// the four packs that keep a function.
//
// Dependency-free and pure by the engine's module rule: the compiled predicate
// reads only `ctx.tracked`.

// Each matcher answers about ONE tracked path. A list value is satisfied by any
// of its entries; the matchers a spec declares must ALL be satisfied by the SAME
// path — which is what makes `{ basename: <marker>, maxDepth: 2 }` mean
// "that marker at the root or one directory down" rather than two unrelated
// facts about the tree.
//
// THE NEAR-ROOT IDIOM. `{ basename, maxDepth: 2 }` is the corpus's shared way of
// fingerprinting a project by its config file, and the `2` is the whole point: a
// project root is the repo root or one directory down (a monorepo's `app/`,
// `functions/`, `server/`), but never deeper, so a copy of the same marker inside
// a nested fixture, example or vendored tree cannot trip detection. Four packs
// declare it, and engine-tests/pack-detect.test.mjs holds the convention across
// them at once rather than in four copies.
const MATCHERS = {
  is: (path, want) => list(want).includes(path),
  endsWith: (path, want) => list(want).some((s) => path.endsWith(s)),
  basename: (path, want) => list(want).includes(path.slice(path.lastIndexOf('/') + 1)),
  matches: (path, re) => re.test(path),
  maxDepth: (path, n) => path.split('/').length <= n,
};

const list = (v) => (Array.isArray(v) ? v : [v]);

/**
 * Compile a `detect` spec (the `{ trackedPath: {...} }` object form) into the
 * `(ctx) => boolean` predicate the engine's fingerprint drift check calls.
 * Returns `{ detect, errors }`: `errors` are `{ what, fix }` in the loader's
 * shape, and `detect` is null when the spec could not be compiled — the shape
 * itself is pack.schema.json's job, so the only fault reachable here is a
 * `matches` pattern that is not a valid regular expression.
 */
export function compileDetect(spec) {
  const errors = [];
  const entries = [];
  for (const [key, want] of Object.entries(spec.trackedPath)) {
    const match = MATCHERS[key];
    if (key === 'matches') {
      try {
        entries.push([match, new RegExp(want)]);
      } catch (e) {
        errors.push({
          what: `declares a detect trackedPath.matches that is not a valid regular expression: ${e.message}`,
          fix: 'fix the pattern (JSON strings need the backslashes doubled — "^\\\\.github/workflows/" for a literal dot)',
        });
      }
      continue;
    }
    entries.push([match, want]);
  }
  if (errors.length) return { detect: null, errors };
  const satisfies = (path) => entries.every(([match, want]) => match(path, want));
  return { detect: (ctx) => ctx.tracked.some(satisfies), errors };
}
