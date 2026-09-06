# Selling Claudinite: what closing the source would take

Research for #1814. **This is an options paper, not a plan and not a design.** It states what the
product is, what a packaged distribution would cost to build from here, what the storefronts permit,
and what an organisational tier needs. It picks nothing except where an owner decision is recorded
inline.

Facts fetched from GitHub's own documentation are cited. Comparable pricing comes from search
snippets and is attributed rather than asserted. Anything unverifiable from this session is marked.

---

## 1. The unit of adoption is the repository

Claudinite is not a developer's tool that happens to sit in a repo. **A repository adopts it.** The
repo declares its packs, runs its own scheduled tasks in its own Actions, validates its own state
through checks at the Stop gate and in CI, and carries its own local packs. Every human and every
agent working on that repo gets the same corpus because the *repo* has it, not because each person
installed something.

That settles the delivery question. Claudinite installs **into the repository's working tree**, the
way `npm install` populates `node_modules`: a manifest and a lockfile are committed, the artifacts
are fetched, and nothing fetched is committed.

```
Committed                                    Fetched at install, gitignored
├── .claudinite-settings.json   declaration   .claudinite/shared/     engine + entitled packs
├── claudinite-lock.json        pins+digests  .claudinite/claudinite-rules.GENERATED.md
├── .claudinite/local/packs/    THEIRS        .claude/skills/         mounted skills
├── .claude/settings.json       hook wiring   .claudinite/cache/      artifact cache
├── CLAUDE.md                   the @-import
└── .github/workflows/*.yml     two thin stubs
```

**Everything above the fold stays exactly where it is today.** The mount path does not move, so the
105 files across `packs/`, `engine/`, `vendoring/` and `.github/` that name `.claudinite/shared` stay
correct; `CLAUDE.md`'s `@`-import of `.claudinite/claudinite-rules.GENERATED.md` stays correct; the
skills mount stays correct. What changes is one line in `.gitignore` and who writes the tree — an
install command instead of a nightly commit.

> An earlier draft of this document routed packs through Claude Code's plugin marketplace. That was
> a category error: plugins install per user, per machine, and enable a *person*. Nothing in it
> survives except as a note on what the platform happens to offer.

### What the package model buys

- **Nothing of ours is redistributed.** Not in their repo, not in their git history, not in a fork,
  not in a tarball their own customer receives.
- **The stream is gated at the door.** Install and update are authenticated events, so entitlement,
  revocation, per-pack SKUs and metering are natural rather than bolted on.
- **The nightly maintenance PR collapses.** Today it rewrites thousands of lines of vendored tree
  and needs an anti-rewind guard, a stamp, and transactional prune ordering. Under install it bumps
  a lockfile — one line, like Dependabot. Most of `engine/migrations/` goes with it: a regenerated
  mount does not need path-relocation records, only member-owned files (settings, workflow stubs,
  local packs) still do.

### What is opaque, and what cannot be

The engine, checks, task workers and fleet sweeps are our Node code and compile to a real binary
(Node SEA, `bun build --compile`). A pack ships as a signed, versioned artifact. But rules and
skills are read as Markdown from disk by the harness at the moment of use, so install materialises
them in the clear. The artifact is opaque in transit and at rest; the materialised subset is not.

This is the same position npm's paid registries occupy, and it is sufficient: a copier holds a
snapshot that decays from the next release, and broke a licence to get it.

---

## 2. Delivery: CDN artifacts, entitlement by claim

**Artifacts.** Immutable, content-addressed, versioned, signed, served from a CDN. Install resolves
the declaration against the lockfile, fetches what is missing into a local cache, verifies digests
and signatures, and materialises the entitled subset into `.claudinite/shared/`. A cached, pinned,
immutable artifact behind a CDN is a build-time dependency of exactly the kind every repo already
has a dozen of.

**Entitlement, and this is the part the repo-as-unit framing makes clean.** GitHub Actions issues
each job an OIDC token whose claims include **`repository`, `repository_id`, `repository_owner`,
`repository_owner_id` and `repository_visibility`**, with a settable audience. So in CI:

- the workflow requests an ID token (`permissions: id-token: write`),
- the licence service verifies it against GitHub's issuer and reads the repository claims,
- and returns a short-lived download token for exactly that repo's entitled packs.

**No secret is stored in the customer's repository at all.** The `_id` claims are immutable, so a
rename does not break a licence and one repo cannot present as another. Outside Actions — a
developer's machine, a web session — the equivalent is a **signed licence token with a validity
window, verifiable offline**: install checks a signature, not an endpoint, so the only network
dependency is the CDN, and periodic refresh is what enforces revocation.

**Three install moments, one command:**

| Context | When install runs |
|---|---|
| **GitHub Actions** (scheduler, executor, fleet sweeps) | An explicit step in the two workflow stubs, before the engine runs. OIDC; no secret |
| **Claude Code on the web** | The environment Setup script — which the `claude-code-web-users-support` pack already owns and already re-pastes wholesale |
| **Developer machine** | After clone, like `npm ci`. A `SessionStart` hook can install, but **not for that session's rules**: `CLAUDE.md` and its imports are read as context is assembled, so a hook that writes the rules index is too late for the session it runs in |

That last row is the one genuinely new mechanic and it has two candidate answers — the hook installs
and **halts** the session with "run `claudinite install`", or it installs and serves the first
session's rules as hook context while the file lands for every session after. Both are small; they
differ in whether a stale checkout is loud or self-healing.

**A missing mount must fail loudly.** Today an unconverged member is caught by
`rules-index-current`. Under install the failure mode is a gitignored directory that is simply
absent — and a session with no rules looks exactly like a session with nothing to say. The
equivalent gate has to exist before the first customer runs it. This also retires the question of
where rules live: they stay in `.claudinite/claudinite-rules.GENERATED.md`, generated at install,
gitignored, `@`-imported as now. *(An earlier turn recorded a decision to materialise rules into
`.claude/rules/`; that decision answered a question the plugin framing created and the repo model
does not. Path-scoping the corpus with `.claude/rules/`'s `paths:` frontmatter remains available on
its own merits — it would cut the ~13,000 always-on rule tokens a session currently pays — but it is
an unrelated improvement, not a packaging requirement.)*

---

## 3. Distribution options

### Option 1 — Licence only, delivery unchanged

Add a `LICENSE` — there is none today, so the public repo is already all-rights-reserved — and
terms; keep the public clone. Contractual enforcement only. **0.5–1 week**, mostly not engineering.

### Option 2 — Package the product (the target model)

§1 and §2. Engine and packs as signed CDN artifacts, installed into the repo's working tree,
gitignored, entitled by OIDC in CI and a signed token elsewhere.

### Option 3 — Option 2 plus a hosted control plane

Adds a service holding entitlements, aggregating the fleet and serving the dashboard, while
execution stays on the customer's runners and their Claude account — so inference COGS stays at
zero. The shape the enterprise tier wants (§6).

### Option 4 — Hosted execution

Scheduler, executor and fleet sweeps run on our infrastructure. The only shape where the corpus
never lands on a customer machine, and the only one that acquires inference COGS. A SaaS build, 3+
months to parity, plus on-call. Its real argument is a different product — zero-setup, cross-org
intelligence — not secrecy.

---

## 4. Engineering effort — converting today's feature set to Option 2

One experienced engineer.

| Workstream | Effort | Notes |
|---|---|---|
| Licence, terms, privacy policy, visibility decision | 0.5–1 wk | Mostly legal. A new outbound connection changes the privacy claim, and this repo's rules require the disclosure to move in the same commit |
| Build and publish pipeline: pack → signed versioned artifact; engine → compiled binary; CDN | 3–4 wks | Multi-platform if compiled; signing keys and their rotation |
| `claudinite install`: resolver, lockfile, cache, digest and signature verification | 2–3 wks | The core new component |
| Licence service: OIDC verification, signed offline tokens, entitlement store, revocation | 2–3 wks | Small because the claim does the identifying |
| Flip the mount to gitignored + the loud missing-mount gate + bootstrap changes | 1–2 wks | Paths unchanged, so this is a delivery flip, not a refactor |
| Workflow stubs gain an install step and `id-token: write` | 1 wk | Stubs cannot converge, so this is a **fleet-wide PR** |
| Web environment Setup script | 0.5 wk | The pack already owns and re-pastes one |
| Developer-machine install ergonomics (halt vs. self-heal) | 1–2 wks | §2's open mechanic |
| Migration for existing members: un-vendor, gitignore, install step, migration record | 2–3 wks | Must tolerate a member on the old mount for one convergence window |
| Rewrite the `update` task as a lockfile bump | 1 wk | Net **deletion**: the transactional converge, the anti-rewind guard and most path-relocation records go |
| Metering with explicit opt-in and disclosure | 1–2 wks | Product decision before engineering |
| Site, docs, onboarding, support intake | 2–4 wks | |
| **Total** | **~3–4 months**, roughly a fifth of it not code | |

The estimate is *lower* than the vendored-mount analysis suggested, for a reason worth stating: the
repo stays the unit, so nothing about the mount's shape changes, and the largest cost in the
packaging is a build pipeline rather than a refactor. A meaningful slice is also net simplification
the project would want anyway — a lockfile instead of a nightly tree rewrite.

---

## 5. Storefront and pricing

**GitHub Marketplace fits better under this model than under any other**, because the thing being
sold is scoped to repositories and organisations — GitHub's own account model — and the GitHub App
that carries the listing is also the natural replacement for today's hand-issued
`FLEET_GITHUB_TOKEN`. Its constraints, verified:

- Paid listings are for **apps, not Actions**; the app must be owned by an organization that is a
  **verified publisher**, with **≥100 installations** for a GitHub App.
- Plans are free, flat rate, or per-unit, where per-unit means **per user in an organization — there
  is no per-repo unit** — and there is **no metered billing**.
- Every plan needs a monthly and an annual price; USD only; ≤10 plans; free trials fixed at 14 days.
- GitHub retains **5%**; payout once monthly revenue reaches **$500**.
- Two channel rules bite on a free/paid split: you cannot list a free plan in Marketplace while
  selling the same thing outside it, and once a free listing qualifies for paid you must offer a
  paid plan in Marketplace.

The per-unit gap is the one real friction: the product's natural meter is repositories, and
Marketplace only counts users. Flat-rate bands by fleet size express it; anything finer bills
outside Marketplace, subject to those channel rules.

**The free/paid line is a resolver decision now** — the licence entitles a set of packs, and an
unentitled pack does not install:

| Naturally free | Naturally paid |
|---|---|
| Engine, `basics`, `claudinite-lifecycle` | `claudinite-fleet-sheepdog` — the fleet itself |
| Technology packs (`node`, `python`, `ios`, `android`, `flutter`, …) | `claudinite-growth` + `claudinite-canon-curation` — the growth lifecycle |
| `claudinite-dashboard` in **repo** mode | `claudinite-dashboard` in **fleet** mode |
| `claudinite-tasks` — arguable either way | A hosted private org canon (§6) |

The line coincides with enforceability: everything free works with no further contact after install;
everything paid needs cross-repo credentials or aggregation. A free single-repo tier costs nothing
to serve and is what produces the 100 installations a paid GitHub App listing requires.

**Comparables** (search snippets, September 2026, attributed not asserted): CodeRabbit ~$24 per
user/month annual; Greptile free for one active developer, Pro ~$30 per seat/month with 50 credits
and $1 per extra; Graphite roughly $24–$40 per user/month.

---

## 6. Organisational Shepherd — enterprise adoption

Today's fleet is one repo, one PAT, one owner, one shelf.

1. **Multi-tenant fleet control plane.** Tenancy records; roster from the App's installation
   repositories rather than `/user/repos`; per-tenant scheduling, failure reporting and rate-limit
   isolation. **6–10 wks**
2. **Private org canon.** Each tenant's own versioned shelf — what `.claudinite/local/packs/` is
   today, promoted to a hosted, access-controlled registry. Under Option 2 this is *the same
   registry and the same install path the product already ships from*, which is a large saving over
   building it twice. Biggest differentiator and the stickiest asset. **4–8 wks**
3. **Identity, roles, user management.** GitHub identity via the App; owner/admin/maintainer/viewer;
   team mapping; SSO and SCIM above mid-market. Note the entitlement subject stays the *repository*;
   users are who may change policy, not who may run. **4–8 wks**
4. **Approvals and policy.** Who may approve a rule into the org shelf, which repos it applies to,
   staged rollout, waivers with expiry, and an audit trail. The corpus has severities, advisories
   and migration records but nothing answering *"who decided this, and when"*. **4–6 wks**
5. **Hosted fleet reporting.** The dashboard's fleet mode exists but publishes to the customer's own
   Pages and signs in with a pasted token. **3–5 wks**
6. **Org-wide entitlement.** `repository_owner_id` and the `enterprise` claim make an
   organisation-wide licence a claim check rather than a roster sync — cheap, given §2. **1–2 wks**
7. **Compliance.** SOC 2 (Type I first), DPA, sub-processors, pen test. Packaging *helps* the trust
   story — nothing of ours enters their repository, and CI needs no stored secret — while a control
   plane erodes it. **3–6 months elapsed, part-time, plus real money**
8. **Enterprise billing.** POs, invoicing, annual contracts, seat reconciliation. **Marketplace
   cannot do any of this.**
9. **Support, SLA, GHES and self-hosted runners.** GHES issues its own OIDC tokens from its own
   host, so the licence service must accept a per-customer issuer; air-gapped runners need an
   offline artifact bundle.

**Total: 5–10 months**, and it changes the shape of the company.

---

## 7. Risks and open questions

- **Rules and skills are readable while in use.** Accepted: the artifact is opaque, the materialised
  subset is not, and the moat is the stream.
- **The corpus is already public and unlicensed.** Closing it binds nobody retroactively; existing
  copies and forks keep working. *(Fork count unverified — `api.github.com` is proxy-blocked in this
  environment; needs a human or an unblocked environment.)*
- **The install step is a new failure surface**, not because a CDN is unreliable but because a repo
  that never installs looks healthy. The loud missing-mount gate is load-bearing, and it is the one
  thing that must exist before the first paying customer.
- **The developer-machine ordering problem** (§2) is small but real and has no precedent in the
  current design.
- **Signing key management** becomes a production responsibility with no equivalent today.
- **Trust inversion is smaller than it looks.** Nothing of ours in their repo, and no secret in CI,
  is a *better* story than today's. Metering is the only genuinely new egress, and it is optional.
- **Preserve zero COGS.** Execution on the customer's Actions and inference on their Claude account
  is an unusually good margin structure. Only Option 4 gives it up.

---

## 8. The decisions this document deliberately does not make

1. **Compiled binary, or readable JS in a signed artifact?** — the difference is build-pipeline cost
   against a speed bump.
2. **Developer-machine install: halt, or self-heal?** — §2's open mechanic.
3. **Storefront** — GitHub Marketplace, direct billing, or both, subject to §5's channel rules.
4. **Where the free/paid line runs** — the pack split in §5, a repo count, or a capability line.
5. **Does anything ever leave the customer's repository?** — constrains Options 3 and 4 and most
   of §6.
6. **Is the enterprise product hosted by us, or a self-hosted Shepherd behind a licence key?**

---

## Sources

- [OIDC reference — token claims](https://docs.github.com/en/actions/reference/security/oidc) — `repository`, `repository_id`, `repository_owner`, `repository_owner_id`, `repository_visibility`, custom `aud`
- [OIDC in cloud providers](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers) — `ACTIONS_ID_TOKEN_REQUEST_URL`, requesting the JWT
- [Requirements for listing an app](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app)
- [Pricing plans for GitHub Marketplace apps](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/pricing-plans-for-github-marketplace-apps)
- [Billing customers](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/billing-customers) · [Receiving payment](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/receiving-payment-for-app-purchases)
- Pricing comparables, search snippets: [Greptile](https://www.greptile.com/content-library/best-ai-code-review-tools) · [tech-insider](https://tech-insider.org/coderabbit-vs-greptile-vs-qodo-2026/) · [Developers Digest](https://www.developersdigest.tech/blog/best-ai-code-review-tools-2026)
