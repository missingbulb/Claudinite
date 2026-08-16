# claude-code-web-users-support pack

What a project can offer the people working on it **from the web** — a Claude Code web session runs
for a signed-in person in a managed container, and a terminal session does neither, so this is where
the capabilities that depend on knowing *who* is here live. Today that is one: each person's
personal interaction preferences, read at session start from a configured store repo by
[`session-start.mjs`](session-start.mjs).

Declared, and seeded by `--init`. The pack holds an **address**, not the content: `config.repo` (and
an optional `config.path`, default `preferences`) name the store that holds one `<email>.md` per
person. Every miss — no identity, no configured store, no file, a failed fetch — is one plain-text
note and the session proceeds on default interaction behaviour.

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Personal interaction preferences | 277 | medium | complexity | prose |
| If this repo is the store | 104 | high | correctness | prose + check (`preferences-store-file-names`) |
| Adding or changing a preference | 67 | medium | complexity | prose |

## Checks

Both are advisory: a preference store is a nice-to-have, and nothing here may block a session.

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `preferences-store-configured` | advisory | medium | complexity | a declaring repo names its store, without which the pack is a silent no-op |
| `preferences-store-file-names` | advisory | high | correctness | in the store repo itself, every file under `path` is a person's `<identity>.md` (or the store's own `README.md`) — the file name is the whole address, so a misnamed file is never opened |
