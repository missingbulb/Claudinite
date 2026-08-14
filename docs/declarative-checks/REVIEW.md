# Declarative checks — review

Status: review record for #838, following up #827 (declarations moved to
`packs/<pack>/declared-checks.json`). Covers five questions: the vocabulary's generality, message
discipline, what else converts, engine performance, and what the linter field teaches. The engine
under review is [engine/checks/helpers/pattern-rules.mjs](../../engine/checks/helpers/pattern-rules.mjs);
its design record is [engine/checks/DESIGN.md](../../engine/checks/DESIGN.md). All numbers measured
2026-08-14 on this checkout (610 tracked files, Node 22).

## The short version

- **The architecture is validated by the field.** ESLint, Vale, Spectral and markdownlint all
  converged on the same shapes this engine already has: rules as data over a shared single-pass
  scan, per-rule severity in repo config, findings that carry their own teaching text. Nothing
  surveyed is adoptable as a dependency under the vendored-verbatim / zero-dependency constraints —
  the win is importing idioms, and several of the best are already here (Vale's document-part
  scoping ≈ `checkSections`; Spectral's `given`/`then` ≈ the parsed-doc assertions).
- **Generality**: 10 of the 18 spec keys are single-use — the per-case reading is right for the
  long tail. Three key clusters are the same idea spelled thrice and can merge; four cross-rule
  facilities (named file classes, structural self-exclusion, a rule-level `fix` default,
  comment-blind scanning) would remove most of the boilerplate that makes declarations long.
- **Messages**: the median message field is 16 words but the tail runs to 58; fix strings restate
  whole policies and repeat verbatim within rules. The field's discipline — quote the evidence,
  state one action — plus a meta-check over the spec files themselves (the format is JSON, so the
  meta-lint is a schema plus word caps, itself landable as a declared check) closes it.
- **Conversion**: 5 of 61 imperative code rules convert today with zero vocabulary change (the five
  jwt rules — one shared mechanism, ~220 lines to delete); ~5 more with three genuinely general
  key additions. The other ~50 stay imperative for structural reasons (git state, session
  transcript, config-driven scans, real parsing, cross-file joins). The bigger cleanup there is
  helper consolidation: four copies of comment-stripping, three hand-rolled config-schema
  validators, three base-vs-head JSON key diffs.
- **Performance**: the whole-repo world sweep is 0.67s; the declarative engine is already the fast
  path (all 25 declared rules share one ~35ms scan). The two real boosts are the `barrier` rule
  (274ms — 61% of rule time, re-extracting per-line candidates once per edge) and the base-ref
  refresh fetch (0.7–8s of network per run, paid again on every Stop-hook turn with changes).

## 1. The measured state

89 registered rules across canon + local packs: 25 pattern-declared (JSON), 3 barrier edges
declared as pack-manifest data (a second, older declarative vocabulary), 61 imperative code rules.
All 13 work-scoped rules are imperative — `patternRule` has no work-scope vocabulary (nothing over
added lines, commits, or the transcript), so every declared check is world-scoped by construction.

Key usage across the 25 declarations: `matchLines` 6, `checkEachFile` 5, `checkSections` 5,
`relevantWhen` 5 — the workhorses — then a long tail of one use each: `maxLines`,
`coveredByGlobLine`, `listedInFile`, `checkKeyValueFile`, `equalParsedValues`, `requirePaths`,
`whenMissing`, `checkParsedFile`, `forEachParsedEntry`, `repoWide`, `skipLinesMatching`.

Whole-repo world sweep (35 active world rules on the home): 0.67s wall without the base-ref fetch,
1.43s with it. Phase split: module imports 22ms, pack discovery 44ms, context build 42ms, rules
452ms. Slowest rules: `barrier` 274ms, `pack-discovery-entry-await` 55ms, the entire declared-rule
family ~35ms (billed to whichever declared rule runs first — the shared-scan design working as
intended), `warning-suppression` 24ms, `markdown-link-labels` 12ms.

## 2. Generality (task 1)

The per-case shape is real but concentrated: the workhorse keys are genuinely general, and the
long tail is one key per converted check. Three clusters are the same idea under different names
and can collapse without inventing a query language:

| Cluster | Keys today | One idea |
|---|---|---|
| Bounds | `maxLines`; `minBullets`/`maxBullets`/`maxBulletBlockLength` (inside `checkSections`) | a count/length bound over a unit (lines, bullets, characters) |
| Index coverage | `listedInFile`, `coveredByGlobLine` | every selected path must be covered by an entry in an index file — the two differ only in what an entry is (an `asText` template vs a first-token glob) |
| Parsed-document assertions | `checkParsedFile`, `forEachParsedEntry`, `equalParsedValues` | select nodes by field path (with filters), then assert — Spectral's `given`/`then`, already backed by one shared parse cache and `fieldAt` |

The parsed-document merge is the highest-value one: a `checkParsedFiles` entry with a field-path
selector (`inFilesMatching`/`file` + `atField` + `whereFieldEquals`) and a small closed assertion
set (`requireField`, `forbidField`, `forbidValueInArray`, `equalsFieldIn` another file) carries all
three current keys plus the next several structured checks, and message placeholders (`{path}`,
`{value}`) fall out of the selector. Spectral's `@key` addressing (assert on key names, not
values) is the one missing capability the current `fieldAt` model can't express.

Two consolidations are cheaper than they look and remove more authoring friction than any key
merge — the boilerplate is what actually makes declarations read as verbose:

- **Named file classes.** `excludeFiles` regexes for test files are hand-repeated
  (`google-token-email-verified`, `web-speech-capture-released-on-pagehide` carry near-identical
  test/fixture exclusions), and every skill's checks hand-exclude the skill's own directory
  (`"excludeFiles": "/^skills\\/google-id-token-validation\\//"`). Named classes usable at
  `scanFiles`/`excludeFiles` (`"testFiles"`, `"codeFiles"`, `"workflowFiles"`) mirror Vale's
  scopes and ESLint's shared settings; the self-exclusion shouldn't even be a class — the engine
  knows which directory a declaration file lives in, so excluding the declaring skill's own tree is
  structural (the canon's own prefer-structural-classifier rule, applied to the engine).
- **Rule-level message defaults.** `in-session-github-access` repeats one 30-word `fix` three
  times; `product-wiki-growth-log` repeats its fix three times. A rule-level `fix` (and `what`)
  default inherited by assertions, overridable per assertion, removes the duplication the
  format's no-comments rule otherwise amplifies.

And one capability gap: the imperative side has string-aware comment stripping
([engine/checks/helpers/code-scanning.mjs](../../engine/checks/helpers/code-scanning.mjs)); the
declarative side only has `skipLinesMatching`, which `in-session-github-access` uses as a weaker
approximation (`/^\s*(\/\/|\*|\/\*)/` misses trailing comments and can match inside strings). A
`scanIgnoringComments: true` key backed by `stripComments` (newline-preserving, so line numbers
hold) makes the declarative form as precise as the code it replaces — and is a precondition for
converting most code-facing candidates.

What NOT to do: a general selector algebra (JSONPath, ast-grep's `all`/`any`/`not`/`inside`
composition) as the base vocabulary. The corpus's own rulings decide this — keys must read alone
to a cold reader (#789/#799), and a knob nobody would set differently shouldn't exist (#707). The
composition vocabulary is the growth path *when a real check needs it*, added as wordy named keys,
not a platform to build ahead of need. Single-use keys whose semantics are genuinely distinct
(`checkKeyValueFile`, `repoWide`) are fine as they are: each is data over shared machinery, and
deleting them buys nothing.

## 3. Message discipline (task 2)

A declared check's failure renders `what` + `failureMessage` (as the why line) + `fix`. Median
field is 16 words; the tail: `web-speech-capture-released-on-pagehide.fix` 58 words,
`google-token-email-verified.failureMessage` 47, `gha/no-scheduled-fleet-executor.fix` 44,
`product-wiki-freshness.fix` 40 (with an embedded JSON snippet). The long ones share a shape:
`failureMessage` argues the rule's philosophy in multiple clauses, and `fix` restates the whole
policy including its alternatives instead of naming the one action.

The surveyed tools converge on a tight message discipline (ESLint's ecosystem enforces
`^[A-Z].*\.$` — a complete sentence stating the problem; Semgrep interpolates the matched text into
the message; Vale caps a message at what the writer must do):

- **`what` quotes the evidence.** State the violated expectation with the matched content in it —
  the engine's `{match}`/`{path}`/capture-group interpolation exists; use it everywhere. A finding
  that quotes the offending token is actionable; one that restates the rule is not.
- **`fix` is one imperative clause** — the single next action. Alternatives, escape hatches, and
  policy context are the `failureMessage`'s one causal clause or nothing. When a fix wants a menu,
  that's usually the rule doing two jobs (or prose that belongs in the pack's README).
- **`failureMessage` is the consequence, once** — why the defect bites, ≤ ~20 words. Where `what`
  already implies it, shorter still. (It doubles as the catalog description in `--list`, which
  rewards the one-line form.)
- **Enforce it with a meta-check.** The format being JSON makes this cheap and is the field's
  "lint the linter" idiom (`eslint-plugin-eslint-plugin`): a declared check over
  `packs/*/declared-checks.json` — word caps per field, no fix string repeated verbatim within a
  rule (that's the rule-level default's job), interpolation keys that exist. The existing
  vocabulary can carry the word caps today; the rest is a small imperative check or a schema.

Fixture discipline transfers too: ESLint's RuleTester contract — every rule tested as
(input text, expected findings) pairs through the real engine, every message exercised — is the
see-it-fail rule in executable form, and
[engine-tests/pattern-rules.test.mjs](../../engine-tests/pattern-rules.test.mjs) already runs that
way. Worth pinning as the convention when the meta-check lands: a declared check with no fixture
exercising it is a finding.

## 4. What else converts (task 3)

Full per-rule audit: 61 imperative code rules (plus one CLI-only gate and the 3 barrier-data
edges). Verdicts:

**Convertible now, zero vocabulary change — 5 rules, one cluster.** The five jwt rules
(`jwt-hardcoded-secret`, `jwt-sign-sets-expiry`, `jwt-none-not-accepted`,
`jwt-verify-binds-audience`, `jwt-verify-pins-algorithms`) are all the same mechanism: select
non-test source files → gate on the file importing the library → optionally bail on a word
appearing anywhere in the file → flag lines matching a call pattern. That is exactly
`scanFiles` + `excludeFiles` + `whenFileMatches` + `unlessFileMatches` + `matchLines`. Converting
them deletes ~220 lines plus the pack's `scan.mjs` and is the single best next conversion.
(Partial conversions also available now: `product-wiki-layout`'s `requirePaths` half,
`skill-no-enforcement-narration`'s runner-mention half.)

**Convertible with a small, genuinely general extension — ~5 rules.** Ranked by the #707 test
(who else would use the key):

| Extension | Carries | General? |
|---|---|---|
| `unlessPreviousLineMatches` on a matchLines assertion | `warning-suppression` (reason-above-the-marker) | yes — previous-line context is a standard line-scan concept |
| `maxLineLength` (bytes) beside `maxLines` | `rules-line-length` | yes — every prose-width rule |
| `andLineMatches` (second must-also-match pattern) | `task-phase-discipline` | yes — conjunction on one line |
| whole-text multiline match (`matchText`) | `sudden-termination-vs-teardown` | borderline — one user today |
| match-count / numeric-capture range | `scheduler-workflow-shape`'s cron legs | borderline — Vale's `occurrence` says the count form recurs; the numeric range is one user |

A key added for exactly one rule reproduces the per-case smell — the borderline two should wait
for a second customer.

**Stays imperative — ~50 rules**, for causes the vocabulary shouldn't chase: git history/diff/base
state (14 — all work-scoped rules among them), session transcript (3), project/pack config driving
the scan (9), pack metadata via `ctx.packs` (5), real parsing — balanced brackets, indentation
state, HTML attributes, TOML (16), cross-file joins where one file's parsed value names the other
(8). A declarative work scope (assertions over added lines) would cover only ~3 rules today — not
worth the vocabulary until that changes.

**The cheaper wins in the imperative corpus are consolidations, not conversions:**

- Four separate comment-stripping implementations (`code-scanning.mjs`'s, leaflet's
  length-preserving fork, and two local-pack copies) → one helper with a `preserveOffsets` option.
- Three hand-rolled pack-entry config validators (`growth-config`, `preferences-store-configured`,
  `barrier`'s config half) → one declarative config-schema seam on the pack manifest (ESLint's
  `meta.schema` idiom).
- Three base-vs-head JSON key diffs (`node/earn-each-dependency`, `cer/permission-added-store-issue`,
  `adoption-answers-pending`) → a `work.addedKeys(file, atPath)` helper.
- The near-identical `cer/release-workflows` / `sw/release-workflows` pair → shared
  "vendored set present" machinery, with the `requirePaths` halves declarable today.

## 5. The engine, and the quick performance boost (task 4)

The mechanism is sound: one pass over the scanned tree for every pattern rule, per-context result
cache, shared read and parse caches, lines split once per file per pass. At 25 declared rules the
whole family costs ~35ms — adding declared rules is nearly free, which is the property the
conversion program needs. Two boosts are worth taking; both are localized:

1. **The `barrier` scan re-derives per-line candidates once per edge** (274ms, 61% of rule time).
   [packs/barriers/engine.mjs](../../packs/barriers/engine.mjs) runs `candidatesOn(line)` (two
   regex sweeps) and `resolveRef` per candidate inside `scanEdge`, so a `siblings` edge — expanded
   to one sub-edge per child directory — and any overlapping edges recompute identical extraction.
   Candidates depend only on the line; caching extraction per file (as the pattern engine caches
   its scan per context) makes edge count nearly free. A cheap prefilter (skip lines containing
   neither `.` nor `/`) stacks on top. Expected: most of the 274ms on multi-edge repos.
2. **The base-ref refresh fetch is the dominant wall-clock item** (~0.75s here, up to its 8s
   timeout; `refreshBaseRef` in
   [engine/checks/helpers/repo-context.mjs](../../engine/checks/helpers/repo-context.mjs)) — and
   the Stop hook pays it on every turn with tracked changes. The fetch exists for work-scope
   honesty (the stale-base false-verdict class DESIGN.md documents) and must stay; the boost is a
   freshness window —
   skip the fetch when the remote-tracking ref was already refreshed within the last few minutes
   (readable from `FETCH_HEAD`/ref mtime). Bounded staleness, no correctness change beyond the
   window, and it converts the per-turn cost to once per session burst. (Skipping the fetch
   entirely in world-`all` runs is tempting but wrong to do blind: `--changed` scoping and the
   delta context still derive from the merge-base.)

Not worth taking: the per-file `existsSync`+`statSync` pair and the ~10 git spawns in context
build (42ms total), and pack discovery's eager imports (44ms — load-bearing for structural
discovery, #581).

## 6. Technology review (task 5)

Constraints that frame every verdict: plain Node ≥18, zero dependencies, the engine vendored
verbatim into members, everything must run on credentials and settings members already have. A
tool members must install is dead-on-arrival per the standing ruling (a missing binary = the
capability silently dead per repo); a native-binary npm dependency breaks vendored-verbatim.

### The tools

| Tool | What it is | Verdict for us |
|---|---|---|
| **ESLint v10** | JS linter; since v9.7 a language-agnostic core with official JSON/Markdown/CSS language plugins — rules are `{meta, create}` listeners over a shared parse | Not adoptable (JS-ecosystem dependency tree), but the strongest source of idioms: `meta.messages` with `{{placeholders}}`, `meta.schema` validating per-rule options, capability flags (`fixable`, `hasSuggestions`), RuleTester's valid/invalid contract, and meta-linting rules themselves. Its `no-restricted-syntax` — a generic engine rule instanced by per-config selector+message data — is the field's endorsement of exactly the `patternRule` design (and its findings all reporting one shared rule id is the weakness our per-spec `id` already avoids) |
| **ast-grep** | Rust/tree-sitter structural search; YAML rules (`pattern`/`kind`/`regex` atoms, `inside`/`has` relations, `all`/`any`/`not` composition); Node via `@ast-grep/napi` | **Poor fit.** Our targets are Markdown prose, YAML workflows, JSON configs — Markdown isn't a built-in language (custom grammar = per-platform native artifact), plain text isn't a language at all, and napi is a 0.x native addon resolving nine platform-specific binaries. For config files, path-shaped queries (Spectral) beat CST compositions. Steal the rule-file vocabulary (`id/message/severity/note/fix`, named `utils` sub-rules, the composition algebra) as a future growth path, not the tool |
| **Semgrep** | OCaml/Python semantic grep; `patterns`/`pattern-either`/`pattern-not-inside`, metavariables interpolated into messages; `generic` mode for config-ish text | Non-embeddable (no Node surface; CLI install per member) and the official rules are under an internal-use-only license. Steal: AND/OR/not-inside vocabulary, metavariable-in-message, `focus-metavariable` (match wide, report narrow), per-rule `paths.include/exclude` |
| **remark-lint / markdownlint / textlint** | Markdown/prose linters over mdast / micromark tokens / TxtAST | The dependency trees don't transfer; the contracts do. markdownlint hands every rule both the token stream *and* raw `lines` — endorsement of our line-first engine with an optional structural layer (which `checkSections` already is). Its `fixInfo` (`{lineNumber, editColumn, deleteCount, insertText}` — a fix as a data splice) is the most vendorable autofix model surveyed, the natural shape if declared checks ever grow fixes. Container suppression (ignore matches inside code fences) should be engine-default — `markdownIndex` already blanks fences for sections; line rules don't get that for free yet |
| **Vale** | Go prose linter: styles = directories of YAML rules, each `extends` one of 11 closed primitives (`existence`, `occurrence`, `substitution`, …), with `scope:` targeting document parts (heading/paragraph/list/code) | The closest architectural cousin, independently converged: closed primitive set instantiated by data ≈ the assertion vocabulary; `scope` ≈ `checkSections`. Its `occurrence` primitive (min/max matches in scope) confirms the bounds-cluster merge in §2; single-binary Go distribution confirms there's no free lunch for prose linting as a dependency |
| **Spectral** | Node JSON/YAML linter: `given` (JSONPath) selects nodes, `then` (`field` + function from a small closed set: `pattern`, `truthy`, `defined`, `schema`, `enumeration`, `length`) asserts; `{{path}}`/`{{value}}` message placeholders; `@key` addresses key names | ~20 runtime dependencies — not adoptable. The `given`/`then` decomposition is the model for the parsed-document merge in §2, implementable as a dot-path subset over the existing `fieldAt` + [minimal-yaml](../../engine/checks/helpers/minimal-yaml.mjs) machinery (the YAML half the field solves with heavy parsers, this engine already solved with a vendored minimal one) |
| **actionlint / yamllint** | Deep GitHub-workflow checker (typed `${{ }}` expression checking against modeled contexts) / YAML style checker | actionlint's depth comes from modeling the platform's types — beyond our economics to build, wrong to imitate with regexes. The defensible integration is additive-when-present: a member CI step, or invoked only if the binary exists with an explicit "tool absent, skipped" note (never silent). yamllint: closed rule set, notable only as severity/inline-disable prior art |

### Cross-cutting idioms worth importing

Beyond the ones already folded into §§2–3 (message discipline, meta-lint, named scopes, rule-level
defaults, fixture contract):

- **Dual-tier remediation** — auto-applied `fix` vs human-opted `suggestion`, declared as a
  capability in rule metadata. Relevant only if declared checks grow fixes; if they do,
  markdownlint's data-splice shape keeps the spec pure JSON.
- **Rule tags** for bulk toggling (markdownlint's `headings`/`whitespace`; Semgrep categories).
  At 89 rules with per-pack activation already doing most of that job, not yet earned.
- **`off` as a severity value** — already exists (`rules: {"<id>": "off"}`); the field confirms
  one-knob-per-rule over separate disable mechanisms.
- **Inline disables** (the five-verb `disable`/`enable`/`disable-line`/`disable-next-line`/
  configure-file grammar, with required reasons). The config-side `accept` mechanism with
  mandatory reasons is deliberately stronger (reviewable in one file, provenance-stamped);
  importing inline disables would weaken it. Noted to reject explicitly.
- **A doc URL riding in the finding** (`meta.docs.url`, Vale `link`): the surveyed tools carry
  one; #827 settled that declarations are self-standing, and the message discipline in §3 is how
  that stays workable.

### Embeddability conclusion

Four options weighed: keep the hand-rolled engine (zero install surface, and the hard parts of the
big tools — JS ASTs, taint analysis, typed workflow contexts — are parts this corpus doesn't
need); depend on `@ast-grep/napi` (native 0.x addon, nine platform binaries — breaks
vendored-verbatim for no Markdown/prose payoff); shell out to member-installed CLIs (violates the
runs-on-what-members-have ruling; Semgrep adds a rules-licensing hazard); or adopt formats without
tools. **The last, on top of the first, wins on every axis** — and is what §§2–5 spell out
concretely.

## Sources

Primary: this tree (engine, packs, tests) and the measurements in §1/§5. External, read
2026-08-14: [ESLint custom rules](https://eslint.org/docs/latest/extend/custom-rules),
[no-restricted-syntax](https://eslint.org/docs/latest/rules/no-restricted-syntax),
[languages](https://eslint.org/docs/latest/extend/languages),
[eslint-plugin-eslint-plugin](https://github.com/eslint-community/eslint-plugin-eslint-plugin),
[ast-grep rule config](https://ast-grep.github.io/guide/rule-config.html),
[ast-grep languages](https://ast-grep.github.io/reference/languages.html),
[ast-grep JS API](https://ast-grep.github.io/guide/api-usage/js-api.html),
[Semgrep rule syntax](https://docs.semgrep.dev/writing-rules/rule-syntax),
[Semgrep generic mode](https://docs.semgrep.dev/writing-rules/generic-pattern-matching),
[Semgrep licensing](https://docs.semgrep.dev/licensing),
[markdownlint custom rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/CustomRules.md),
[remark-lint](https://github.com/remarkjs/remark-lint),
[textlint rule docs](https://github.com/textlint/textlint/blob/master/docs/rule.md),
[Vale styles](https://docs.vale.sh/topics/styles),
[Spectral rulesets](https://docs.stoplight.io/docs/spectral/e5b9616d6d50c-rulesets),
[actionlint](https://github.com/rhysd/actionlint),
[yamllint rules](https://yamllint.readthedocs.io/en/stable/rules.html). Versions via the npm
registry API. Unverified (flagged, not asserted): Semgrep's install channels; whether Semgrep
still accepts the legacy INFO/WARNING/ERROR severities; `@ast-grep/napi` support for custom
tree-sitter grammars.
