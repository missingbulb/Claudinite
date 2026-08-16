# node pack

Active when the repo has a root `package.json`. Prose-only (the module-resolution and jsdom gotchas are runtime behaviours with no clean static signature).

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A named import from a package's CommonJS entry can silently yield undefined. | high | correctness | prose: 130 words |
| Modern Node (22.7+) detects ES-module syntax in a .js file on its own | medium | correctness | prose: 79 words |
| node --test skips dot-directories, so a bare invocation over a suite living under one runs zero tests and exits green. | critical | correctness | prose: 98 words |
| body.innerText is null in jsdom. | medium | correctness | prose: 52 words |
| runScripts: "outside-only" (the default) parses <noscript> into live DOM — the opposite of a real browser. | medium | correctness | prose: 51 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `node/earn-each-dependency` | medium | complexity | check: advisory |
