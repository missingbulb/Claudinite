---
name: nodejs-testing
description: Node.js and jsdom testing gotchas where a green test masks real-browser breakage. Use when working in Node/npm codebases, especially DOM-touching tests running under jsdom.
---

Follow [technologies/nodejs.md](../../technologies/nodejs.md) — canonical there: jsdom's
`innerText` and `<noscript>` behavior diverge from Chrome in ways a passing test can hide.
