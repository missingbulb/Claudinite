import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripComments } from '../../engine/checks/lib/source.mjs';

test('drops a line comment, keeps the code before it', () => {
  assert.equal(stripComments('const x = 1; // set x\n'), 'const x = 1; \n');
});

test('drops a block comment but preserves interior newlines', () => {
  assert.equal(stripComments('a\n/* two\nlines */\nb'), 'a\n\n\nb');
});

test('a token named only in a comment is stripped (the false positive we exist to kill)', () => {
  const src = "// saved in chrome.storage and spoken by voice\nexport const S = ['a'];\n";
  assert.doesNotMatch(stripComments(src), /chrome\.storage/);
});

test('real code using the token survives', () => {
  const src = 'chrome.storage.local.set({ k: 1 }); // persist\n';
  assert.match(stripComments(src), /chrome\.storage/);
});

test('// inside a string literal is not a comment', () => {
  const src = "const url = 'https://example.com/a'; // note\n";
  assert.equal(stripComments(src), "const url = 'https://example.com/a'; \n");
});

test('an escaped quote does not end the string early', () => {
  const src = 'const s = "a\\"// b"; // c\n';
  assert.equal(stripComments(src), 'const s = "a\\"// b"; \n');
});

test('a comment sequence inside a template literal is preserved', () => {
  const src = 'const t = `x /* y */ z`;\n';
  assert.equal(stripComments(src), src);
});

test('import paths (string literals) are left intact', () => {
  const src = "import { a } from './page-adapter/dom.js';\n";
  assert.equal(stripComments(src), src);
});
