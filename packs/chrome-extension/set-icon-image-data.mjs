import { finding } from '../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';

// Converted from this pack's prose (the prose-to-checks sweep): a
// `chrome.declarativeContent.SetIcon` action handed `path` silently leaves the
// icon unset. `declarativeContent` rules are evaluated by the browser process,
// so the icon must already be raw pixels at registration time — `imageData` is
// the only option that works in practice, and the documented `path` option
// fails without an error anywhere. Blocking: the feature is simply dead, and
// nothing at runtime says so.
//
// FP guards. (1) Comments are stripped first, so prose that merely *names* the
// bad shape (this pack's own RULES.md is markdown and out of the file set, but a
// consumer may well document the gotcha in a code comment) can't fail a build.
// (2) The match is anchored to `declarativeContent.SetIcon(` — an unrelated
// `SetIcon(` from some other library is not this rule's business. (3) The `path`
// key is read at the *top level of the action's own options object*, so a
// `path` nested inside a value (a bundler option, a nested config) is not a
// violation — only the key the API itself reads.
const CALL = /\bdeclarativeContent\s*\.\s*SetIcon\s*\(/g;
const CODE_FILE = /\.(?:js|mjs|cjs|jsx|ts|tsx)$/;

// Offset of a top-level `path:` key inside a call's argument text (the slice
// starting just after the opening paren), or -1. Depth is counted from that
// paren, so the action's options object literal is depth 1 and the call's own
// closing paren ends the scan. String-aware, so a `path` inside a literal (or a
// quoted `'path'` key) is judged correctly rather than by naive text match.
function topLevelPathKey(arg) {
  let depth = 0;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let body = '';
      while (j < arg.length && arg[j] !== c) {
        if (arg[j] === '\\') j++;
        else body += arg[j];
        j++;
      }
      if (depth === 1 && body === 'path' && /^\s*:/.test(arg.slice(j + 1))) return i;
      i = j;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']') { depth--; continue; }
    if (c === ')') { depth--; if (depth < 0) return -1; continue; }
    if (depth === 1 && /[A-Za-z_$]/.test(c)) {
      const word = /^[A-Za-z_$][\w$]*/.exec(arg.slice(i))[0];
      if (word === 'path' && /^\s*:/.test(arg.slice(i + word.length))) return i;
      i += word.length - 1;
    }
  }
  return -1;
}

const rule = {
  id: 'chrome-extension/set-icon-image-data',
  severity: 'blocking',
  description: 'A declarativeContent SetIcon action is given imageData, not path',
  doc: 'packs/chrome-extension/RULES.md',
  why: 'declarativeContent rules are evaluated by the browser process, so the icon must be raw pixels at registration time — the documented path option silently leaves the icon unset, with no error anywhere',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!CODE_FILE.test(file)) continue;
      const text = ctx.read(file);
      if (text === null || !text.includes('declarativeContent')) continue;
      const code = stripComments(text);
      CALL.lastIndex = 0;
      let m;
      while ((m = CALL.exec(code)) !== null) {
        const open = m.index + m[0].length;
        const at = topLevelPathKey(code.slice(open));
        if (at === -1) continue;
        out.push(finding(rule, {
          file,
          line: code.slice(0, open + at).split('\n').length,
          what: 'passes path to a declarativeContent SetIcon action, which silently leaves the icon unset',
          fix: 'decode the packaged icon to pixels and pass imageData instead: fetch(chrome.runtime.getURL(icon)) → blob → createImageBitmap → OffscreenCanvas.drawImage → getImageData',
        }));
      }
    }
    return out;
  },
};

export default rule;
