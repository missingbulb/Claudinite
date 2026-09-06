# Selling Claudinite: what closing the source would take

Research for #1814. **This is an options paper, not a plan and not a design.** It states what the
product technically is, what a packaged (non-vendored) distribution would cost to build from here,
what the platforms permit, and what an organisational tier needs. It picks nothing.

Facts fetched from GitHub's and Claude Code's own documentation are cited. Comparable pricing comes
from search snippets and is attributed rather than asserted. Anything unverifiable from this session
is marked where it appears.

---

## 1. The delivery model is a choice, not a property

Claudinite today commits ~6.3 MB of corpus into the customer's repository at `.claudinite/shared/`
and refreshes it nightly from a public clone. That is an implementation decision — made for
reliability, recorded in [vendoring/DESIGN.md](../../vendoring/DESIGN.md) — and it can be replaced.

**The target model is the package-manager model.** The engine is the CLI; each pack is a package;
both are fetched at install time into a machine-local cache, used, and never committed. Nothing in
cleartext in the customer's repository except **their own local packs** and a small amount of
configuration. The rest of this document assumes that target.

### What the package model does and does not buy

It is worth being exact, because the npm metaphor is precise in a way that cuts both ways.

**It buys, genuinely:**

- **Nothing of ours is redistributed.** The corpus is not in their repo, not in their git history,
  not in a fork of their repo, not in a tarball their customer receives. This is the difference
  between "our IP is in a thousand repositories" and "our IP is on a thousand machines".
- **The stream is gated at the door.** Install and update are authenticated events. Entitlement,
  revocation, version pinning, per-pack SKUs and metering all become natural instead of bolted on.
- **Versioning becomes real.** A lockfile and a resolver replace "whatever last night's converge
  wrote", which is a better engineering story independent of the commercial question.

**It does not buy secrecy at the moment of use.** `node_modules` is cleartext JavaScript; the
plugin cache is cleartext Markdown. Two components behave differently:

| Component | Can it ship opaque? |
|---|---|
| Engine, checks, task workers, fleet sweeps (our Node code) | **Yes** — a genuine compiled binary (Node SEA, `bun build --compile`) or at minimum a minified bundle. Multi-platform builds required |
| Skills (`SKILL.md`) and rules prose | **No.** Claude Code reads them as Markdown from disk. A binary can hold them encrypted and materialise them at install time, which raises copying from `git clone` to `cat` — a speed bump, not a wall |

So the honest framing stays the one from §2 of the first draft, sharpened: **the moat is the
stream, and the package model is what makes the stream chargeable.** A customer who copies the
materialised corpus holds a snapshot that starts decaying that night, and has broken a licence to
get it. That is the same protection npm's paid registries have, and it is sufficient.

---

## 2. Claude Code already ships the mechanism

This is the finding that most changes the effort estimate. Claude Code's **plugin and marketplace
system** is the npm-shaped distribution channel, first-party, and it does what the target model
needs.

**Packaging.** A plugin bundles skills, agents, hooks, MCP servers, commands, LSP servers,
background monitors, themes and `settings.json` configuration. Plugins install into
`~/.claude/plugins/cache` — **on the machine, not in the repository** — and Claude Code installs a
plugin's eligible Node.js package dependencies into the cached copy.

**Sources** — a marketplace entry names where each plugin comes from:

| Source | Relevance here |
|---|---|
| `npm` (with a private `registry`) | Literally the owner's metaphor, supported natively |
| `archive` (zip over HTTPS) | Any artifact server or S3 bucket; no git or npm needed on the customer's machine |
| `github` / `url` / `git-subdir` | Git, with `ref` and a 40-char `sha` pin |
| `command` | A local tool prints the plugin directory |

**Authentication and entitlement.** An `archive` source takes `headers`, or a **`headersHelper`** —
"a command that prints the HTTP headers for this entry's archive download as one JSON object, for a
credential that expires". Claude Code runs it before each fetch and reuses the output for up to 60
seconds. That is a licence check at every install and update, built into the platform. (Requires
Claude Code v2.1.238+; before that, headers were not sent and installs 401'd.)

**Team wiring without asking anyone to do anything.** A repo's `.claude/settings.json` can carry
`extraKnownMarketplaces` and `enabledPlugins`, so the marketplace registers and the plugins enable
when a teammate trusts the project folder.

**Ephemeral containers and CI — the hard case, already solved.** `CLAUDE_CODE_PLUGIN_SEED_DIR`
points at a pre-populated plugins directory baked at image build time, so Claude Code starts with
marketplaces and plugins available "without cloning anything at runtime". It is read-only, works in
`-p` non-interactive mode, and composes with `extraKnownMarketplaces`. This removes the objection
that a fetch-at-start model is fragile in exactly the environment where it would be most fragile.

**Enterprise distribution.** Team and Enterprise plans distribute plugins through
**Organization settings > Plugins**, syncing a private marketplace repository through the Claude
GitHub App. Constraints worth knowing now: sources must be `github`, `url`, `git-subdir` or a `./`
relative path; private plugin sources work only when they share the marketplace repo's owner; and
**a plugin with a top-level `bin/` directory is rejected** — compiled binaries must live in
`scripts/` and be referenced as `${CLAUDE_PLUGIN_ROOT}/scripts/<name>`.

**Cost transparency.** The `/plugin` view reports each plugin's always-on token cost. Relevant
because Claudinite currently spends ~13,000 always-on rule tokens per session.

### The one thing plugins cannot carry

> "A `CLAUDE.md` file at the plugin root is not loaded as project context. Plugins contribute
> context through skills, agents, and hooks rather than CLAUDE.md. To ship instructions that load
> into Claude's context, put them in a skill."

Claudinite's ~22,000 words of always-on `RULES.md` prose is exactly the thing a plugin cannot ship
as always-on context. Three ways out, and this is a **product decision, not a packaging one**:

1. **Convert rules to skills.** On-demand rather than always-on. Drops the 13,000-token session
   tax to near zero, at the cost of the always-injected guarantee the corpus is built on. The
   corpus already has the machinery to judge this — the prose-to-checks ladder says prose is the
   *last* rung.
2. **Materialise into `.claude/rules/`.** Claude Code loads `.claude/rules/**/*.md` at launch with
   the same priority as `.claude/CLAUDE.md`, discovered recursively — and rules support a `paths:`
   frontmatter that scopes them to file globs, loading only when Claude touches matching files. An
   install step writes the entitled packs' rules there; the directory is gitignored, so nothing is
   committed. **Path-scoping is a genuine upgrade**, not a workaround: most of the corpus is
   technology- or activity-specific and has no business being in every session.
3. **Import from the plugin cache.** A repo `CLAUDE.md` can `@`-import an absolute path, but an
   import resolving outside the working directory triggers a one-time approval dialog — fine
   interactively, wrong for unattended runs.

**Decided (owner, this session): option 2 — materialise into `.claude/rules/`.** It preserves
today's always-injected semantics exactly, which is the property the corpus is built on, and the
`paths:` frontmatter then earns back most of the session tax without changing what a rule
guarantees. Option 1 stays available later as a per-rule judgment — the promotion ladder already
decides which rung a rule belongs on — but it is not the packaging strategy.

Two consequences the rest of this document now assumes:

- **There is an install step, and it must run before the session starts** — not from a
  `SessionStart` hook. Rules are read as the session's context is assembled, so a hook that writes
  them is too late; and hook-injected context is the shape #807 measured silently truncating ~80 KB.
  The install step is `claude plugin install` on a desktop, an `npx` line in the workflow for
  Actions, and the seeded image or the environment setup script for web sessions.
- **A missing mount must fail loudly.** Today an unconverged member is caught by
  `rules-index-current`. Under the package model the failure mode is a gitignored directory that is
  simply absent, and a session with no rules looks exactly like a session with nothing to say. The
  equivalent gate has to exist before the first customer runs it.

---

## 3. What the architecture becomes

```
Customer repo (committed, cleartext)      Machine / runner (fetched, gitignored)
├── .claudinite-settings.json  declaration  ~/.claude/plugins/cache/…   packs
├── claudinite-lock.json       pins+hashes  node_modules/@claudinite/…  engine
├── .claudinite/local/packs/   THEIRS       .claude/rules/**           materialised prose
├── .claude/settings.json      marketplace + hook entry points
└── .github/workflows/*.yml    two thin stubs calling npx
```

Three delivery contexts, each with its own install moment — and this is the structural point the
vendored model was hiding:

| Context | Install moment | Notes |
|---|---|---|
| **Interactive desktop / CLI** | `claude plugin install`, cached per machine | Warm after first fetch; `headersHelper` re-validates the licence on update |
| **GitHub Actions (scheduler, executor, fleet)** | `npx @claudinite/engine` in the workflow step, npm cache | Pure npm — the cleanest of the three. Private registry auth via a repo secret |
| **Ephemeral containers / Claude Code on the web** | seeded image (`CLAUDE_CODE_PLUGIN_SEED_DIR`) or the environment setup script | The reliability risk concentrates here; the seed mechanism is the mitigation |

**What this costs that the vendored model does not:** availability. Adoption today is one network
moment and every session after is offline. Under the package model, install and update depend on
our registry being up and reachable, and on the customer's network policy allowing it. The seed
directory and the machine cache reduce that from per-session to per-version — which is exactly
npm's answer, and it is a good one — but the dependency is real and new.

**The sleeper migration cost:** **105 files** across `packs/`, `engine/`, `vendoring/` and
`.github/` name the path `.claudinite/shared`. The two-root mount assumption
(`.claudinite/(shared|local)/`) is written into checks, rules, tests and workflow stubs. Un-vendoring
is not a delivery change; it is a sweep across the corpus.

---

## 4. Distribution options, re-costed

Options A and D from the first draft survive; B, C and E are absorbed by §2.

### Option 1 — Licence only, delivery unchanged

Add a `LICENSE` (there is none today — the public repo is already all-rights-reserved) and terms;
keep the public clone. Enforcement is contractual. **0.5–1 week**, mostly not engineering. Sells to
buyers who pay for a licence, updates and support; nothing stops anyone else.

### Option 2 — Package the product (the target model)

Engine as a private npm package, packs as plugins in a private marketplace, licence enforced by
`headersHelper` at install and update, nothing committed. §5 costs it.

- **Leakage:** the materialised corpus is readable on the machine. The *stream* is gated.
- **Storefront:** the plugin marketplace is the delivery channel; billing is a separate question
  (§6).
- **Side benefits worth counting:** real versioning and a lockfile; path-scoped rules instead of a
  13,000-token session tax; the engine stops being 105 files' worth of path assumptions.

### Option 3 — Packaged, plus a hosted control plane (Option 2 + D′)

Everything in Option 2, plus a service that holds entitlements, aggregates the fleet, and serves the
dashboard — while **execution stays on the customer's runners and their Claude account**, so
inference COGS stays at zero. This is the shape the enterprise tier wants (§7).

### Option 4 — Hosted execution

Move the scheduler, executor and fleet sweeps onto our infrastructure. The only shape where the
corpus never lands on a customer machine at all, and the only one that acquires inference COGS. A
SaaS build, 3+ months to parity, plus on-call. Under Option 2 the marginal IP protection it buys is
small; its real argument is a different product (zero-setup, cross-org intelligence), not secrecy.

---

## 5. Engineering effort — converting today's feature set to Option 2

One experienced engineer.

| Workstream | Effort | Notes |
|---|---|---|
| Licence, terms, privacy policy, visibility decision | 0.5–1 wk | Mostly legal. Any new outbound connection changes the privacy claim, and this repo's own rules require the disclosure to move in the same commit |
| **Un-vendor: kill the `.claudinite/shared` assumption** | 3–5 wks | 105 files; checks, rules, tests, stubs. The single largest line, and it is not commercial work — it is the refactor the package model requires |
| Engine as a private npm package (+ optional compiled binary) | 2–4 wks | Entry points for hooks and workflows; multi-platform if compiled; binaries in `scripts/`, never `bin/` |
| Packs as plugins; marketplace repo and `marketplace.json` | 2–3 wks | Skills already fit the plugin shape almost exactly |
| **Rules prose → `.claude/rules/` materialisation** (decided) | 3–5 wks | The writer and its gitignore are small; **path-scoping the 25 `RULES.md` files is the expensive half**, and it is content work, not packaging |
| The absent-mount gate that replaces `rules-index-current` | 0.5–1 wk | A session with no rules must fail, not run quietly |
| Licence service: token minting for `headersHelper`, entitlement store, private registry | 2–4 wks | Small, because the platform supplies the client side |
| Actions side: stubs call `npx`, registry auth as a secret | 1–2 wks | Workflow files cannot converge, so this is a **fleet-wide PR** |
| Migration for existing members: un-vendor, gitignore, install step, migration record | 2–3 wks | Must tolerate a member sitting on the old mount for one convergence window |
| Container/web seeding and its docs | 1–2 wks | `CLAUDE_CODE_PLUGIN_SEED_DIR`; the environment setup script for web sessions |
| Metering with explicit opt-in and disclosure | 1–2 wks | Product decision before engineering |
| Site, docs, onboarding, support intake | 2–4 wks | |
| **Total** | **~4–6 months**, roughly a fifth of it not code | |

Two observations on that table. First, **more than half of it is work the project would want
anyway** — un-vendoring, real versioning, and taking the rules out of every session's context are
engineering improvements that happen to also be the commercial prerequisite. Second, the DRM
component is nearly absent: the platform's `headersHelper` is the enforcement point, and it is a
shell script that prints a bearer token.

---

## 6. Storefront and pricing

**The GitHub Marketplace question changes shape.** Under Option 2, the desktop and session half is
delivered through Claude Code's plugin channel, not GitHub's. GitHub Marketplace stays relevant only
for the **fleet/Actions half**, where a GitHub App is genuinely the right cross-repo credential —
and it would replace today's hand-issued `FLEET_GITHUB_TOKEN`, which is a strict improvement
regardless. Its constraints, verified:

- Paid listings are for **apps, not Actions**; the app must be owned by an organization that is a
  **verified publisher**, with **≥100 installations** for a GitHub App.
- Plans are free, flat rate, or per-unit, where per-unit means **per user in an organization —
  there is no per-repo unit**, and **no metered billing**.
- Every plan needs a monthly and an annual price; USD only; ≤10 plans; free trials fixed at 14 days.
- GitHub retains **5%**; payout once monthly revenue reaches **$500**.
- Two channel rules bite on a free/paid split: you cannot list a free plan in Marketplace while
  selling the same thing outside it, and once a free listing qualifies for paid you must offer a
  paid plan in Marketplace.

**The free/paid line is now cleaner than it was**, because packaging makes it a resolver decision:
the licence token entitles a set of packs, and an unentitled pack simply does not install.

| Naturally free | Naturally paid |
|---|---|
| Engine, `basics`, `claudinite-lifecycle` | `claudinite-fleet-sheepdog` — the fleet itself |
| Technology packs (`node`, `python`, `ios`, `android`, `flutter`, …) | `claudinite-growth` + `claudinite-canon-curation` — the growth lifecycle |
| `claudinite-dashboard` in **repo** mode | `claudinite-dashboard` in **fleet** mode |
| `claudinite-tasks` — arguable either way | A hosted private org canon (§7) |

The line coincides with enforceability: everything free works with no further contact from us,
and everything paid needs cross-repo credentials or aggregation — which an App installation scopes
and an entitlement service refuses.

**Pricing models against what each forces technically:**

| Model | Expressible in GitHub Marketplace? | What it forces |
|---|---|---|
| Flat rate per org, banded by fleet size | Yes | Someone counts repos; the fleet sweep already enumerates them |
| Per seat | Yes (per-unit) | A definition of "user" — Claudinite's actors are agents, not people. Proxies: org members committing to member repos, or licence-token activations |
| Per repo | **No** | Bands, or bill outside Marketplace subject to the channel rules |
| Usage / per task-run | **No** | Stripe plus real metering; partial signals exist in the `usage-fold` task and the dashboard's token fold |
| Free single repo, paid fleet | Yes as plans | A **capability** line, not a repo count: fleet packs do not install without an entitled licence. Cleanest to build and to explain |

The free single-repo tier remains the right giveaway: it costs nothing to serve after the install,
and it is what produces the 100 installations a paid GitHub App listing needs.

**Comparables** (search snippets, September 2026, attributed not asserted): CodeRabbit ~$24 per
user/month annual; Greptile free for one active developer, Pro ~$30 per seat/month with 50 credits
and $1 per extra; Graphite roughly $24–$40 per user/month.

---

## 7. Organisational Shepherd — enterprise adoption

Packaging removes one of the nine items outright and shrinks another. Today's fleet is one repo, one
PAT, one owner, one shelf.

1. **Multi-tenant fleet control plane.** Tenancy records; roster from the App's installation
   repositories rather than `/user/repos`; per-tenant scheduling, failure reporting and rate-limit
   isolation. **6–10 wks**
2. **Private org canon.** Each tenant's own versioned shelf — what `.claudinite/local/packs/` is
   today, promoted to a hosted, access-controlled registry. Under Option 2 this is *the same
   registry the product already ships from*, which is a large saving over building it twice.
   Biggest differentiator and the stickiest asset. **4–8 wks**
3. **Identity, roles, user management.** GitHub identity via the App; owner/admin/maintainer/viewer;
   GitHub team mapping; SSO and SCIM above mid-market. **4–8 wks**
4. **Approvals and policy.** Who may approve a rule into the org shelf, which repos it applies to,
   staged rollout, waivers with expiry, and an audit trail. The corpus has severities, advisories
   and migration records but nothing that answers *"who decided this, and when"*. **4–6 wks**
5. **Hosted fleet reporting.** The dashboard's fleet mode exists but publishes to the customer's own
   Pages and signs in with a pasted token. **3–5 wks**
6. **Distribution to the org** — **largely solved.** Organization settings > Plugins syncs a private
   marketplace through the Claude GitHub App, with admin control over what is enabled. What remains
   is conforming to its source rules and keeping binaries out of `bin/`. **1–2 wks**
7. **Compliance.** SOC 2 (Type I first), DPA, sub-processors, pen test. Note packaging *helps* the
   trust story — nothing of ours enters their repository — while any control plane erodes it.
   **3–6 months elapsed, part-time, plus real money**
8. **Enterprise billing.** POs, invoicing, annual contracts, seat reconciliation. **Marketplace
   cannot do any of this**; enterprise means direct billing whatever the self-serve tier uses.
9. **Support, SLA, GHES/self-hosted runners.** Staffing, plus a re-examination of every network
   assumption in the install path.

**Total: 5–10 months**, down from the first draft's estimate, and it still changes the shape of the
company — a SaaS with on-call and a compliance calendar.

---

## 8. Risks and open questions

- **Availability replaces offline.** The current product cannot fail because we are down. The
  packaged one can. The machine cache and the seed directory bound the exposure to per-version, not
  per-session; that is npm's bargain and it should be taken knowingly.
- **Version skew becomes a support surface.** `headersHelper` needs Claude Code v2.1.238+; `archive`
  needs v2.1.224+; `command` sources v2.1.229+. A customer on an older CLI fails in ways the
  documentation describes precisely and users will not.
- **The corpus is already public and unlicensed.** Closing it binds nobody retroactively; existing
  copies and forks keep working. *(Fork count unverified — `api.github.com` is proxy-blocked in this
  environment; needs a human or an unblocked environment.)*
- **Rules-as-skills is a behaviour change, not a repackaging.** The corpus's whole premise is that
  its rules arrive whether or not the agent went looking. Converting them to on-demand skills is the
  single most consequential decision in this document, and it is disguised as a packaging detail.
- **Trust inversion is smaller but real.** Nothing of ours in their repo is a *better* story than
  today's. But install-time licence checks and any metering are new outbound connections.
- **Platform risk cuts both ways.** Building on Claude Code's plugin channel means inheriting its
  roadmap; it also means Anthropic maintains the distribution mechanism we would otherwise fund.
- **Preserve zero COGS.** Execution on the customer's Actions and inference on their Claude account
  is an unusually good margin structure. Only Option 4 gives it up, and it should be given up
  deliberately or not at all.

---

## 9. The decisions this document deliberately does not make

1. ~~Always-on prose, or skills?~~ **Decided: materialise into `.claude/rules/`** (§2).
2. **Does the engine ship as a compiled binary, or as readable JS in a private package?**
3. **Storefront** — Claude Code plugin marketplace alone, plus a GitHub App for the fleet half, plus
   or minus Stripe (subject to §6's channel rules).
4. **Where the free/paid line runs** — the pack split in §6, a repo count, or a capability line.
5. **Does anything ever leave the customer's repository?** — constrains Options 3 and 4 and most
   of §7.
6. **Is the enterprise product hosted by us, or a self-hosted Shepherd behind a licence key?**

---

## Sources

**Claude Code**
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) — sources, `headersHelper`, org distribution, `CLAUDE_CODE_PLUGIN_SEED_DIR`
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference) — components, the CLAUDE.md exclusion, token accounting
- [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins)
- [Memory](https://code.claude.com/docs/en/memory) — `.claude/rules/`, path-scoped rules, `@`-import rules
- [Settings reference](https://code.claude.com/docs/en/settings-reference) — `extraKnownMarketplaces`, `enabledPlugins`

**GitHub**
- [Requirements for listing an app](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app)
- [Pricing plans for GitHub Marketplace apps](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/pricing-plans-for-github-marketplace-apps)
- [Billing customers](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/billing-customers)
- [Receiving payment for app purchases](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/receiving-payment-for-app-purchases)

**Pricing comparables (search snippets)**
- [Greptile](https://www.greptile.com/content-library/best-ai-code-review-tools) · [tech-insider](https://tech-insider.org/coderabbit-vs-greptile-vs-qodo-2026/) · [Developers Digest](https://www.developersdigest.tech/blog/best-ai-code-review-tools-2026)
