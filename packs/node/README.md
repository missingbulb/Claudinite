# node pack

Active when the repo has a root `package.json`. Most rules stay prose (the module-resolution and jsdom gotchas are runtime behaviours with no clean static signature); dependency additions and stale `node --test` invocations have a checkable signature and ride checks instead.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A named CJS import can yield undefined | high | correctness | prose: 130 words |
| Node detects ES-module syntax on its own | medium | correctness | prose: 79 words |
| node --test skips dot-directories | critical | correctness | prose: 148 words + check (`node/node-test-discovery`) |
| body.innerText is null in jsdom. | medium | correctness | prose: 53 words |
| jsdom parses <noscript> into live DOM | medium | correctness | prose: 52 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `node/earn-each-dependency` | medium | complexity | check: advisory |
| `node/node-test-discovery` | critical | correctness | check: blocking |
