# Selling Claudinite: what closing the source would take

Research for #1814. **This is an options paper, not a plan and not a design.** It states what the
product technically is today, what each commercial shape would cost to build from here, and what
GitHub's marketplace actually permits. It picks nothing: every business-model and technical fork is
left as a stated option with its consequences.

Facts fetched from GitHub's own documentation are cited. Comparable pricing comes from search
snippets and is attributed rather than asserted. One thing could not be verified from this session
and is marked where it appears.

---

## 1. What the product is today

The shape matters more than the feature list, because it is what a paid model breaks.

| Property | Today |
|---|---|
| **Payload** | ~6.3 MB of `packs/` — 35 packs, ~22,000 words of `RULES.md` prose, 58 skills, 58 check modules, 28 scheduled tasks — plus a 0.6 MB `engine/` |
| **Delivery** | Committed **plaintext** into the customer's own repo at `.claudinite/shared/`, a declaration-derived subset (`vendoring/compute-vendor-set.mjs`) |
| **Adoption** | One network moment: public `codeload` tarball → `bootstrap.mjs` run against the checkout |
| **Updates** | The nightly `update` task clones `https://github.com/missingbulb/Claudinite.git` `--depth 1`, **public, no token** (`packs/claudinite-lifecycle/tasks/update/worker.mjs`), applies migrations, converges the vendor set, lands one commit on `claudinite/maintenance` |
| **Runtime** | Fully offline. Rules reach a session through `.claudinite/claudinite-rules.GENERATED.md`, `@`-imported by the repo's `CLAUDE.md`. No call home, ever |
| **Compute** | The customer's own GitHub Actions minutes (scheduler + executor workflows) |
| **Inference** | The customer's own Claude account (`CCR_ROUTINE_TOKEN`). **Our COGS today is zero** |
| **Fleet** | One "enforcer" repo declaring `claudinite-fleet-sheepdog`, driven by a human-issued fine-grained PAT (`FLEET_GITHUB_TOKEN`) over one `owner`'s repos |
| **Accounts** | None. No server, no user records, no telemetry |
| **Licence** | **There is no `LICENSE` file.** A public repo with no licence is already all-rights-reserved |
| **Hosted precedent** | One: the dashboard's OAuth `exchangeUrl`, a small serverless token exchange |

### The one fact that governs every option

**The payload must be present, in cleartext, in the customer's repository for the product to
work.** Every session reads it from their own checkout with no network in the hot path. There is
nothing to withhold at runtime, no binary to obfuscate, no server call to refuse. Copy protection
is therefore not achievable at any effort level short of moving execution off the customer's
machine (Option D).

What *is* sellable is not the snapshot but the **stream**: continuous curation — the growth
lifecycle, promotion, dedup, migrations that keep a member's mount converging — plus the fleet
services and support. A customer who copies today's corpus has a file that starts decaying that
night. This reframing is the load-bearing one; most of the options below are variations on how
tightly the stream is gated.

A second consequence: **closing the repo binds nobody retroactively.** Everything already fetched
stays fetched, and existing forks keep their copy. *(Fork and star counts could not be read this
session — `api.github.com` is proxy-blocked in this environment. Worth a human check before any
announcement.)*

---

## 2. What GitHub Marketplace actually permits

All from GitHub's published docs, verbatim source pulled this session.

**Paid listings are for *apps*, not Actions.** Every Marketplace selling page carries the note
*"This article applies to publishing apps in GitHub Marketplace only"*, pointing Actions at a
separate publish path with no billing. **Claudinite today is neither** — it is vendored files plus
workflows in the customer's repo. Selling through Marketplace therefore requires building a GitHub
App that does not exist yet, and that App becomes the entitlement surface.

**Gates on a paid listing:**

- The app must be **owned by an organization that is a verified publisher**. A personal-account app
  must be transferred to an org first.
- **GitHub Apps need ≥ 100 installations**; OAuth apps ≥ 200 users. Free first, paid later — a
  chicken-and-egg the free tier has to solve.
- The app must handle `marketplace_purchase` webhooks for purchases, upgrades, downgrades,
  cancellations and trials.
- Financial onboarding and acceptance of the Marketplace Developer Agreement.

**Plan mechanics:**

- Plans are free, **flat rate**, or **per-unit**. Per-unit is defined as *"a set fee … for each
  user in an organization"* — **there is no per-repository unit**. A per-repo price has to be
  expressed as flat-rate bands, or billed outside Marketplace.
- Every plan needs **both a monthly and an annual price**. USD only. Up to 10 plans.
- Free trials are **fixed at 14 days**, auto-enrol at the end, and GitHub expects private customer
  data deleted within 30 days of a cancelled trial.
- **No metered/usage billing exists.** Usage pricing means Stripe.
- GitHub retains **5%** of transaction income (post-2021). Payout once monthly revenue reaches
  **$500**, at the end of the following month.

**Two rules that constrain a hybrid channel** — these bite directly on "free single repo, paid
fleet":

- *"You can't list your app with a free pricing plan if you offer a paid service outside of GitHub
  Marketplace."*
- *"If you list a paid version of your app outside GitHub Marketplace then, after a free listing
  meets the requirements for paid apps, you must offer at least one paid plan for the app in GitHub
  Marketplace."*

So: selling the fleet tier on Stripe **and** running a free Marketplace listing is not a
combination GitHub's terms allow indefinitely. Either the paid plan also lives in Marketplace, or
the free tier is distributed some other way (a public repo, a CLI, an unlisted App).

---

## 3. Distribution options, costed

Each is a way of answering "how does the corpus reach a paying customer and stop reaching a
non-paying one".

### Option A — Licence only; delivery unchanged

Add a proprietary `LICENSE` and terms; keep the fetch public; record a licence key on the
declaration; ship an advisory check that names an unlicensed paid pack. Enforcement is contractual,
audited by nothing.

- **Changes:** `LICENSE`, terms/privacy pages, one optional config key, one advisory check.
- **Effort:** ~0.5–1 week, mostly not engineering.
- **Leakage:** total. Anyone can clone.
- **Sells to:** companies that pay because their legal department requires a licence, and because
  they want the update stream and support. That is a real market and a bad one to be *only* in.

### Option B — Private canon, credential-gated fetch

The canon repo goes private. Fetching it requires a credential.

- **B1 — per-customer PAT / deploy key.** A repo secret in each member. Cheap to build, but the
  credential clones the whole canon, so leakage is unchanged after the first fetch, and rotation,
  revocation and support fall on us.
- **B2 — GitHub App installation token.** The customer installs an App; the update task exchanges
  the installation for a short-lived token and clones the private canon with it. No human PAT,
  revocable per customer (uninstall or entitlement lapse stops the stream at the next converge), and
  it is the **same App the Marketplace listing sells**.
- **Changes:** the clone auth in the update worker; `bootstrap.mjs`'s one network moment becomes
  authenticated; the canary/rehearsal flows re-point; App + a small token-minting endpoint (or the
  installation-token flow run inside the member's own Action).
- **Effort:** ~2–3 weeks for the fetch path, on top of the App itself (§5).
- **Leakage:** the snapshot still lands in cleartext in the customer's repo. What is gated is the
  **stream**, which per §1 is the actual product.

### Option C — Entitlement service and served bundles

Replace "clone the canon" with "download the vendor set this account is entitled to". The service
takes the customer's declaration, computes the vendor set server-side, returns a tarball, and
records what was served.

- **Buys:** per-pack SKUs, a kill switch, precise metering, the free/paid line enforced at the door,
  and a delivery receipt (which the vendoring design explicitly notes it lacks today).
- **Costs:** a real service with auth, entitlement, bundle build and a CDN; `compute-vendor-set`
  either moves server-side or is duplicated with a drift guard; every fetch path re-points; the
  offline guarantee survives (sessions still read from the checkout) but adoption and nightly
  converge now depend on our uptime.
- **Effort:** ~4–7 weeks on top of the App.

### Option D — Hosted execution (a real "app you buy")

Move the scheduler, executor and fleet sweeps off the customer's Actions onto our infrastructure,
driven by the App. The corpus never lands in the customer's repo, or lands as a thin stub.

- **Only option where the IP genuinely does not ship.**
- **Inverts the product's core design**: offline operation, customer-owned compute, customer's own
  Claude account. If we also run the agent, we acquire inference COGS where today we have none, and
  the margin story changes completely.
- **Effort:** a SaaS build — 3+ months before parity, plus on-call.
- **D′ — hosted control plane only.** Entitlement, fleet aggregation, user management and dashboard
  are hosted; *execution stays on the customer's runners and their Claude account*. This keeps
  zero-COGS and the offline session, and is the pragmatic shape for the enterprise tier (§6).

### Option E — Open core

Keep `engine/`, `basics` and the technology packs open under a real OSS licence. Close the value
packs. Free tier = the open subset on a single repo; paid = the closed packs delivered through B2
or C.

**The SKU boundary already exists in the pack shelf**, which is the strongest structural argument in
this document:

| Naturally free | Naturally paid |
|---|---|
| `engine/`, `basics`, `claudinite-lifecycle` | `claudinite-fleet-sheepdog` (the fleet itself) |
| Technology packs (`node`, `python`, `ios`, `android`, `flutter`, `firebase`, …) | `claudinite-growth` + `claudinite-canon-curation` (the growth lifecycle) |
| `claudinite-tasks` (the queue) — arguable either way | `claudinite-dashboard` in **fleet** mode |
| `claudinite-dashboard` in **repo** mode | An org's private canon shelf (§6) |

Note this splits cleanly along the same line as enforceability: everything in the free column works
with no further contact from us, and everything in the paid column *needs cross-repo credentials or
aggregation* — which is exactly what an App installation can scope and an entitlement service can
refuse.

---

## 4. Pricing model options, and what each one forces technically

| Model | Marketplace-expressible? | What it forces |
|---|---|---|
| **Flat rate per org, banded by fleet size** | Yes (flat rate ×N plans) | Someone must count repos and enforce the band — the fleet sweep already enumerates them; band overage is an advisory, not a hard stop |
| **Per seat** | Yes (per-unit = per user in an org) | A definition of "user" the customer accepts. Claudinite has no users — its sessions are agents. Candidate proxies: org members who commit to member repos, or people whose sessions load the mount (needs telemetry we do not have) |
| **Per repo** | **No** — per-unit is per-user only | Bands (above), or bill on Stripe outside Marketplace, subject to the two channel rules in §2 |
| **Usage / per task-run** | **No** — Marketplace has no metered billing | Stripe, plus real metering. Partial signals exist: the `usage-fold` task and the dashboard's token/cost fold |
| **Free single repo, paid fleet** | Yes as *plans*, awkward as *channels* | The line is a **capability** line, not a repo count: fleet packs simply do not activate without an entitled installation. Cleanest to build and cleanest to explain |

**On the free tier the owner described:** "one repo, no fleet-wide growth, free" is the right thing
to give away precisely because it costs us nothing to serve — after the first fetch it needs no
credential, no server and no support, and it is what generates the 100 installations a paid
Marketplace listing requires.

**Comparables** (search snippets, attributed rather than asserted, September 2026): CodeRabbit ~$24
per user/month annual; Greptile free for one active developer, Pro ~$30 per seat/month with 50
review credits and $1 per extra; Graphite roughly $24–$40 per user/month. The band a per-seat
Claudinite would land in is visible there; a per-org flat tier has fewer public comparables.

---

## 5. Engineering effort — converting today's feature set

Ranges are for one experienced engineer, and assume Option B2 + E (private canon behind a GitHub
App, open-core shelf split) — the middle path. Option C adds its own line; Option D is a different
project.

| Workstream | Effort | Notes |
|---|---|---|
| Licence, terms, privacy policy, repo visibility flip | 0.5–1 wk | Mostly legal, not code. The repo's own rules require the privacy/disclosure surface to change **in the same commit** as any behaviour that adds an outbound connection |
| Shelf split into free/paid SKUs; declaration reads entitlement | 1–2 wks | Structural, and the shelf already suggests the line (§3E) |
| Authenticated canon fetch — bootstrap, update worker, canary/rehearsal, tests | 2–3 wks | Touches the one path where a canon regression is *not* self-healing; the vendoring tests must grow with it |
| The GitHub App: creation, install flow, installation-token minting, webhook receiver, `marketplace_purchase` handling, entitlement store | 3–5 wks | This is the piece that does not exist in any form today |
| Marketplace listing: verified publisher, org transfer, financial onboarding, listing copy and assets | 1–2 wks of work, weeks of elapsed | Blocked behind **100 installations** for a paid plan |
| Stripe billing, if any plan lives outside Marketplace | 2–3 wks | Plus the §2 channel-rule question |
| Replace `FLEET_GITHUB_TOKEN` with App installation tokens | 1–2 wks | Removes the worst adoption step (a hand-issued fine-grained PAT); a strict improvement regardless of the commercial question |
| Metering/telemetry with explicit opt-in and disclosure | 1–2 wks | Changes the product's current "nothing leaves your repo" promise; treat as a product decision first |
| Marketing site, docs, onboarding, support intake | 2–4 wks | |
| **Total to a credible paid launch of today's features** | **~3–4 months**, roughly a third of it not code | |
| *Add for Option C (served bundles instead of a private clone)* | +4–7 wks | |

Two things are *not* in that total and are worth stating: the 100-install threshold is a calendar
dependency nobody can compress, and support load starts on day one of a paid tier.

---

## 6. What an organisational Shepherd needs — enterprise adoption

Today's fleet is one repo, one PAT, one owner, one shelf. Enterprise is a different object. In
rough order of build cost:

1. **Multi-tenant fleet control plane.** Tenancy records; roster derived from the App's
   *installation repositories* rather than `/user/repos`; per-tenant scheduling, failure reporting
   and rate-limit isolation. Today's sweeps assume one fleet per process. **6–10 wks**
2. **Private org canon.** Each tenant gets its own versioned shelf of packs — what `.claudinite/local/packs/`
   is today, promoted to a hosted, versioned, access-controlled registry, with promotion from the
   shared canon into the org's shelf. This is the **biggest differentiator and the biggest build**;
   it is also what makes the product sticky, because the customer's own accumulated rules live in
   it. **6–10 wks**
3. **Identity, roles and user management.** GitHub identity via the App; roles (owner / admin /
   maintainer / viewer); mapping to GitHub teams; SSO and SCIM for anything above mid-market.
   **4–8 wks**
4. **Approvals and policy.** Today a rule enters the canon when the owner merges a PR. An
   organisation wants: who may approve a rule into the org shelf, which repos a rule applies to,
   staged rollout, waivers with expiry, and an audit trail of every rule that ever governed a repo.
   Note the corpus already has the raw material — severities, advisories, migration records — but
   nothing that answers *"who decided this, and when"*. **4–6 wks**
5. **Hosted fleet reporting.** The dashboard's fleet mode exists but publishes to the customer's own
   Pages and signs in with a pasted token. Enterprise wants it hosted, authenticated, retained and
   exportable. **3–5 wks**
6. **Compliance and trust.** SOC 2 (Type I first), DPA, sub-processor list, pen test, and a clear
   answer to *"what leaves our repositories"*. Today the honest answer is "nothing", which is a
   genuine selling point that any control plane erodes — so the disclosure and the architecture
   should be decided together. **3–6 months elapsed, part-time, plus real money**
7. **Enterprise billing.** POs, invoicing, annual contracts, seat reconciliation. **Marketplace
   cannot do any of this** — enterprise sales means direct billing regardless of what the
   self-serve tier uses.
8. **Support and SLA.** Staffing, not engineering.
9. **GHES / self-hosted runners.** If it comes up in enterprise deals, every network assumption in
   the fetch path has to be re-examined.

**Total: 6–12 months**, and it changes the shape of the company — a SaaS with on-call and a
compliance calendar, rather than a corpus with a nightly job. The D′ variant (hosted control plane,
customer-side execution) is the version that keeps zero inference COGS and the offline session while
still selling something an organisation can buy.

---

## 7. Risks and open questions

- **Text IP cannot be protected.** Sell the stream, not the snapshot. Any plan whose revenue
  depends on customers being unable to copy the corpus is built on sand.
- **The corpus is already public.** Closing it binds nobody retroactively; existing copies and forks
  keep working. *(Fork count unverified from this session — `api.github.com` is proxy-blocked here;
  needs a human or an unblocked environment.)*
- **Trust inversion.** The current product's strongest property is that nothing leaves the
  customer's repo. Entitlement checks, metering and a control plane each spend some of that.
- **Marketplace chicken-and-egg.** 100 installations before a GitHub App can carry a paid plan.
- **Channel rules.** Free-in-Marketplace plus paid-outside is not a combination GitHub's terms
  support indefinitely (§2).
- **Platform risk.** Claude Code's own skills/plugins ecosystem plausibly absorbs the single-repo
  value over time. The fleet, the org canon and the approvals layer are the defensible parts — which
  argues for giving the single repo away regardless of the pricing model chosen.
- **Support cost of a gated fetch inside customer CI:** token expiry, orgs that block third-party
  Apps by policy, GHES, air-gapped runners. Every one of these is a ticket the current public clone
  never generates.
- **Preserve the zero-COGS property if possible.** Execution on the customer's Actions and
  inference on the customer's Claude account is an unusually good margin structure; Option D is the
  only one that gives it up, and it should be given up deliberately or not at all.

---

## 8. The decisions this document deliberately does not make

1. **Bytes or stream** — is the paid thing the corpus, or continuous curation and fleet services?
2. **Storefront** — Marketplace as the channel, Stripe with a free Marketplace listing, or both
   (subject to §2)?
3. **Where the free/paid line runs** — the pack shelf split (§3E), a repo count, or a capability
   line?
4. **Does anything ever leave the customer's repository?** This one decision constrains options C,
   D and most of §6.
5. **Is the enterprise product hosted by us, or a self-hosted Shepherd behind a licence key?**

---

## Sources

- [Requirements for listing an app](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app)
- [Pricing plans for GitHub Marketplace apps](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/pricing-plans-for-github-marketplace-apps)
- [Billing customers](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/billing-customers)
- [Receiving payment for app purchases](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/receiving-payment-for-app-purchases)
- [Handling new purchases and free trials](https://docs.github.com/en/apps/github-marketplace/using-the-github-marketplace-api-in-your-app/handling-new-purchases-and-free-trials)
- [GitHub Marketplace Developer Agreement](https://docs.github.com/en/site-policy/github-terms/github-marketplace-developer-agreement)
- Pricing comparables, via search snippets: [Greptile](https://www.greptile.com/content-library/best-ai-code-review-tools), [tech-insider](https://tech-insider.org/coderabbit-vs-greptile-vs-qodo-2026/), [Developers Digest](https://www.developersdigest.tech/blog/best-ai-code-review-tools-2026)
