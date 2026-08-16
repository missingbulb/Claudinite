# node pack

Active when the repo has a root `package.json`. Prose-only (the module-resolution and jsdom gotchas are runtime behaviours with no clean static signature).

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| A named import from a package's CommonJS entry can silently yield undefined. | 130 | high | correctness | prose |
| Modern Node (22.7+) detects ES-module syntax in a .js file on its own | 79 | medium | correctness | prose |
| node --test skips dot-directories, so a bare invocation over a suite living under one runs zero tests and exits green. | 98 | critical | correctness | prose |
| body.innerText is null in jsdom. | 52 | medium | correctness | prose |
| runScripts: "outside-only" (the default) parses <noscript> into live DOM — the opposite of a real browser. | 51 | medium | correctness | prose |

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `node/earn-each-dependency` | advisory | medium | complexity | a dependency added to `package.json` is worth its cost against a built-in or a few lines |
