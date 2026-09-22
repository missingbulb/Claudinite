import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripComments } from '../engine/checks/helpers/code-scanning.mjs';

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

// A REGEX LITERAL IS CODE, and the quote, apostrophe or `//` inside one is part of
// the pattern. Reading such a character as the start of a string ran the scanner in
// string state for the rest of the file: every comment after it survived stripping
// (a check matching its own warning prose) and every later string read as code.
test('a double quote inside a regex literal does not open a string', () => {
  const src = 'const re = /instructions" must be a string/; // note\n';
  assert.equal(stripComments(src), 'const re = /instructions" must be a string/; \n');
});

test('an apostrophe inside a regex literal does not open a string', () => {
  const src = "const re = /the pack's id/; // note\nconst x = 1; // gone\n";
  assert.equal(stripComments(src), "const re = /the pack's id/; \nconst x = 1; \n");
});

test('a slash pair inside a regex literal is not a comment', () => {
  const src = 'const re = /https:\\/\\/x/; // note\n';
  assert.equal(stripComments(src), 'const re = /https:\\/\\/x/; \n');
});

test('a slash inside a regex character class does not end the literal', () => {
  const src = 'const re = /[/"]a/; // note\n';
  assert.equal(stripComments(src), 'const re = /[/"]a/; \n');
});

test('division is not read as a regex literal', () => {
  const src = 'const q = total / count; // per item\nconst s = "kept";\n';
  assert.equal(stripComments(src), 'const q = total / count; \nconst s = "kept";\n');
});

// A `${}` hole holds CODE, and that code may open a template of its own. Without the
// nesting, the inner literal's opening backtick closed the outer one and everything
// after it read inside-out — the same runaway state as the regex case above.
test('a template literal nested in a ${} hole does not close the outer one', () => {
  // The escaped backtick is what made the mis-read visible: inside the inner
  // template it is one character, read as code it opens a template of its own.
  const src = 'const t = `a${xs.map((x) => `- \\`${x}\\``).join("")}b`;\n// note\nconst s = "kept";\n';
  assert.equal(stripComments(src), 'const t = `a${xs.map((x) => `- \\`${x}\\``).join("")}b`;\n\nconst s = "kept";\n');
});

test('a comment inside a ${} hole is stripped, the template text around it kept', () => {
  const src = 'const t = `a${/* drop */ x}b`;\n';
  assert.equal(stripComments(src), 'const t = `a${ x}b`;\n');
});
