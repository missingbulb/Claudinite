# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** Verified in this session against jsdom 30.0.1 on Node v22.22.2:
  `document.body.innerText` came back `undefined` — falsy, so `el.innerText || el.textContent`
  does fall through to `textContent` exactly as the rule describes, and a visible-text scrape
  can pass under test while finding nothing or the wrong thing in Chrome. **Precision note for
  a future review**: the value is `undefined`, not `null` as the rule's wording says; the
  behaviour the rule turns on is unaffected. Recovered from the rule's own pre-#467 text (cut
  by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this
  pack had a references.md to hold it).
- **(RULES-2)** Verified in this session against jsdom 30.0.1 on Node v22.22.2. Parsing `<div
  id=x>A<noscript><b>NO</b></noscript>B</div>`: under the default `runScripts` the `<noscript>`
  was parsed into live DOM (one child element) and `textContent` read a clean `"ANOB"`; under
  `runScripts: "dangerously"` the `<noscript>` was kept as raw text (zero child elements) and
  `textContent` read `"A<b>NO</b>B"` — the markup splicing into the value that a real browser
  produces. The default is the opposite of a browser, and the test-passes/production-fails
  asymmetry is confirmed in both directions. Recovered from the rule's own pre-#467 text (cut
  by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this
  pack had a references.md to hold it).

- **(RULES-4)** Measured on this canon (#2062) against Node v22.22.2: `check_the_world.mjs
  --list` printed a ~150-row catalog and exited, and with six cores busy **15 of 60**
  `spawnSync` callers got it cut off at a row boundary — exit status 0, empty stderr, no signal
  of any kind that the answer was short. Converting the runner to `process.exitCode` took it to
  60 of 60 under the identical load. The hazard needs output written *before* the exit and a
  pipe on the other end, which is every caller that captures rather than inherits. Retire the
  rule if Node makes pipe writes synchronous or flushes them on `process.exit()`; a hook or CLI
  whose exit code is its whole protocol is the sanctioned holdout, and says so at its call site.
- **(RULES-3)** setup-node's README: its v5 breaking changes "enabled caching by default with
  package manager detection if no cache input is provided", scoped to a `package.json` whose
  `packageManager` or `devEngines.packageManager` names npm, and its `cache-dependency-path` note
  that the key is a hash of the lockfile. The conditional form is
  `packs/chrome-extension/stubs/workflows/chrome-extension-create-package.yml`, live in members,
  whose own comment records that npm caching needs a lockfile. Retire when setup-node caches
  without a lockfile or stops enabling itself. Filed under #2019.
