# host-page-adaptation pack

Declared by hand (opt-in) by a project that drives a web app it does not own — a userscript, a
browser-automation layer, or an extension's content script reading and writing another site's
DOM. No fingerprint: the shape is behavioral (a synthetic-event dispatch, a `MutationObserver`
started on the page), not a file or dependency a marker could name.

Every rule judges a DOM/API contract, not a product decision — none of it is specific to any one
host or project. `chrome-extension` covers MV3 *mechanics* (manifest, permissions, how a content
script reaches the page and why it can't be an ES module); this pack covers what to do once your
code is there. `web-speech` owns the speech-surface facet of driving a page; this pack owns the
rest of it.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Quarantine host DOM knowledge in one module | high | complexity | prose: 159 words |
| Identify host UI by a net | high | correctness | prose: 129 words |
| Date what selectors were verified against | medium | correctness | prose: 97 words |
| Ship a probe, never an exception | medium | complexity | prose: 132 words |
| Mirror the host in a fixture | medium | correctness | prose: 124 words |
| Never trust a write; verify by re-reading | high | correctness | prose: 167 words |
| A synthetic keystroke needs real-event fields | high | correctness | prose: 205 words |
| Restore borrowed host state; degrade | medium | correctness | prose: 117 words |
| The host's lifecycle isn't your user's doing | high | correctness | prose: 207 words |
| Be inert when you are off | medium | correctness | prose: 120 words + check (`page-observers-disconnected`) |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `page-observers-disconnected` | high | correctness | check: blocking |
| `synthetic-input-events-bubble` | high | correctness | check: blocking |

**Scope.** Both scan any browser source file (`.js`/`.mjs`/`.cjs`/`.ts`/`.tsx`/`.jsx`) except
test and vendor paths — never a hard-coded project root. Each rule is gated on the DOM API it
judges actually appearing in the file, so the API usage *is* the trigger and the scan stays
repo-shape agnostic; a path scope wired to one layout would make every rule match zero files
and pass vacuously green elsewhere, the worst failure mode a check has. The exclusion that
matters is test scaffolding: a test dispatching a bare event at its own jsdom node, or spinning
an observer it lets the runner collect, is doing something purpose-built and is not adapting to
a host page.

**Parsed, not grepped, where the name alone doesn't decide it.** `synthetic-input-events-bubble`
judges only events that are actually **dispatched** (a probe event constructed to feature-detect
is not input), only the interfaces that model **real user input** (a `CustomEvent` is your own
signal to your own listener and is legitimately non-bubbling), and it resolves each side of the
dispatch through **one hop**: the constructor through an alias (`const Ctor = isKey ?
view.KeyboardEvent : view.MouseEvent` is how a generic `fire()` helper is written), and the
dispatched value through a local (`const ev = new MouseEvent('click'); el.dispatchEvent(ev)` is
the other shape real dispatch code takes). An init that spreads (`{ ...init }`) without an
explicit `bubbles:` is beyond what the rule can see, so it stays silent there: the caller may
well set the field, and a check that guessed would false-alarm on precisely the well-factored
helper that centralises this.

A third check — a synthetic `KeyboardEvent` init must carry `keyCode`/`which` — was cut at
review: the one shape that lesson protects against (an init built in a helper and spread at the
single dispatch site) is exactly the shape a spread-silent check can never read, so it could
only ever fire on code that bypasses the helper — and the mistake in that code is the bypass,
not the field it then forgot. That lesson lands as prose instead ("A synthetic keystroke must
carry the fields a real one would").

`page-observers-disconnected` is deliberately **file-scoped, not flow-scoped**: proving a
particular observer is disconnected on every path needs real data-flow analysis, and a check
that guesses is worse than one that asks a simple, honest question — "this file starts an
observer on the page; does it anywhere disconnect one?". An observer constructed but never
`.observe(`d has started nothing and is not asked.

**Provenance.** Distilled from `missingbulb/CrosswordChat`'s `page-adapter/` module (selectors,
reader, writer, watcher, probe, splash, session-button), its architecture test enforcing the
DOM-quarantine boundary, its live-page findings recorded against a real host, and its fake-host
fixture for CI-testable read/write/watch cycles. Nothing in it is invented; the two checks were
already written repo-shape agnostic and lifted as-is, with only the `doc:` path rewritten.
