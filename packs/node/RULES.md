# Node.js

## Module resolution

- **A *named* import from a package's CommonJS entry can silently yield `undefined`.** Node recovers named bindings from a CJS module by static analysis, and that analysis fails on plenty of real entry points (a re-export built at runtime, a conditional assignment) — with no error: the import resolves, the binding is `undefined`, and the failure surfaces later as "x is not a function". When a package ships both entries, import the **ESM** one explicitly (`…/package/index.mjs`, or the `import` condition of its `exports`) for named bindings; when it doesn't, `import pkg from '…'` and destructure off the default. Resolve the package's own directory (`$(npm root -g)/<pkg>` for a global install) rather than hardcoding an absolute path into a version-pinned layout, which moves under you on the next image or upgrade.
- **Modern Node (22.7+) detects ES-module syntax in a `.js` file on its own** — no `"type": "module"`, no flag, no warning. A directory of ES modules therefore needs **no `package.json` of its own** just to be loadable; adding one to declare module-ness is cargo cult, and one already present for that reason is vestigial. (Prefer `.js` consistently within a tree over mixing in `.mjs` for the same purpose; the extension is then a style choice, not a signal.)
- **A throwaway script that needs a project dependency (e.g. `jsdom`) can't live in a scratchpad outside the repo.** Node's module resolution walks up the directory tree from the script's own location, and a scratchpad directory external to the project never reaches its `node_modules` — the script fails with `Cannot find module` however correctly the dependency is installed in the repo. A one-off script that needs a real dependency has to live inside the project tree instead (a gitignored scratch subdirectory works, cleaned up before committing).

## Runtime behavior

- **`btoa`/`atob` operate on Latin1 code units, not arbitrary Unicode text.** Calling either directly on a string containing a character beyond U+00FF (any non-Latin1 script — Hebrew, Cyrillic, CJK, most emoji) throws or silently corrupts it; the failure is invisible until real, non-ASCII data reaches it, which a Latin-only test fixture never exercises. Encode/decode as UTF-8 bytes first — `Buffer.from(str, 'utf8').toString('base64')` / `Buffer.from(str, 'base64').toString('utf8')` in Node, or a `TextEncoder`/`TextDecoder` bridge where `Buffer` isn't available — rather than calling `btoa`/`atob` on the text directly.
- **Before relying on a version-gated Node runtime feature, check what version CI actually pins** — the workflow's `setup-node` step (or equivalent), not the version installed in the sandbox you're working in. A session's own Node can be newer than CI's pin, so code that behaves correctly against the newer runtime can still fail in CI against the older one; a local green run proves nothing about the version that will actually execute the code in production.

## Test discovery

- **`node --test` skips dot-directories, so a bare invocation over a suite living under one runs
  zero tests and exits green.** Node's default discovery walks the tree but ignores hidden
  directories outright, and finding nothing is *success* — a run reporting no failures because it
  found no tests reads exactly like a passing suite. Any CI step or local command meant to exercise
  tests under a dot-path must pass that path (or an explicit glob) as an argument, and whoever adds
  the step confirms it by watching the **test count be non-zero**, never by watching it go green.
  Naming a path is not enough — the argument must **resolve to files that exist**: a typo'd
  glob, a moved fixture or a renamed directory produces the identical zero-test green, so the
  property to assert is that every path a `node --test` invocation names still matches something
  in the tree.

## jsdom diverges from a real browser in ways a green test can hide

- **`body.innerText` is null in jsdom.** Code reading `el.innerText || el.textContent` therefore falls through to `textContent` under test, which *includes* the `<script>` / `<style>` text, `<select>` / `<option>` text, and CSS-hidden text a real browser's `innerText` omits. Treat body-text results as jsdom-optimistic; never add a test that only passes because of it. (1)
- **`runScripts: "outside-only"` (the default) parses `<noscript>` into live DOM — the opposite of a real browser.** A `textContent` read looks clean under test but splices the `<noscript>` markup into the value in Chrome, which keeps `<noscript>` as raw text. Parse a script-free fragment with `runScripts: "dangerously"` to reproduce the browser. (2)
