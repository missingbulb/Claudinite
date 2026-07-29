// The declarative fingerprint compiler. The point of the vocabulary is that a
// fingerprint is DATA, so the tests it needs are about the semantics that data
// implies — above all that the matchers a spec declares must hold of the SAME
// tracked path, which is what makes `{ basename, maxDepth }` mean "near the root"
// rather than two independent facts about the tree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileDetect } from '../../engine/pack_loader/detect-spec.mjs';

const fires = (trackedPath, files) => {
  const { detect, errors } = compileDetect({ trackedPath });
  assert.deepEqual(errors, []);
  return detect({ tracked: files });
};

test('is: the whole path, exactly — one value or a list', () => {
  assert.equal(fires({ is: 'template.yaml' }, ['template.yaml']), true);
  assert.equal(fires({ is: 'template.yaml' }, ['sub/template.yaml']), false);
  assert.equal(fires({ is: ['template.yaml', 'template.yml'] }, ['template.yml']), true);
  assert.equal(fires({ is: ['template.yaml', 'template.yml'] }, ['template.json']), false);
});

test('endsWith: a path suffix at any depth', () => {
  const marker = 'ios/Runner/Info.plist';
  assert.equal(fires({ endsWith: marker }, [marker]), true);
  assert.equal(fires({ endsWith: marker }, [`app/${marker}`]), true);
  assert.equal(fires({ endsWith: marker }, ['ios/Runner/Info.plist.bak']), false);
});

test('basename: the final segment only — a path that merely contains the name does not match', () => {
  assert.equal(fires({ basename: 'firebase.json' }, ['a/b/firebase.json']), true);
  assert.equal(fires({ basename: 'firebase.json' }, ['firebase.json/notes.md']), false);
  assert.equal(fires({ basename: 'firebase.json' }, ['firebase.json.bak']), false);
});

test('matches: a regular expression over the whole path', () => {
  const re = '^\\.github/workflows/.+\\.ya?ml$';
  assert.equal(fires({ matches: re }, ['.github/workflows/ci.yml']), true);
  assert.equal(fires({ matches: re }, ['.github/workflows/nested/ci.yaml']), true);
  assert.equal(fires({ matches: re }, ['github/workflows/ci.yml']), false);
  assert.equal(fires({ matches: re }, ['.github/workflows/ci.json']), false);
});

test('maxDepth counts path segments — 1 is the repo root', () => {
  assert.equal(fires({ maxDepth: 1 }, ['README.md']), true);
  assert.equal(fires({ maxDepth: 1 }, ['docs/README.md']), false);
});

// The whole reason a spec is one object rather than a list of independent facts.
test('the declared matchers must all hold of the SAME path', () => {
  const nearRoot = { basename: 'pubspec.yaml', maxDepth: 2 };
  assert.equal(fires(nearRoot, ['pubspec.yaml']), true);
  assert.equal(fires(nearRoot, ['app/pubspec.yaml']), true);
  assert.equal(fires(nearRoot, ['packages/inner/pubspec.yaml']), false);
  // A shallow file and a deep marker are not a match, however many paths there are.
  assert.equal(fires(nearRoot, ['README.md', 'packages/inner/pubspec.yaml']), false);
});

test('an empty tree never fingerprints', () => {
  assert.equal(fires({ basename: 'package.json', maxDepth: 2 }, []), false);
});

// The one fault reachable here: field SHAPE is pack.schema.json's job, but no
// schema can tell whether a string compiles as a regular expression.
test('a matches pattern that is not a valid regular expression is a reported fault, not a throw', () => {
  const { detect, errors } = compileDetect({ trackedPath: { matches: '^(unclosed' } });
  assert.equal(detect, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0].what, /not a valid regular expression/);
  assert.match(errors[0].fix, /backslashes doubled/);
});
