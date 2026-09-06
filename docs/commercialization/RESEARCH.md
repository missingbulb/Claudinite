# Selling Claudinite: storefront, licensing channel and pricing

The mechanism — how a repository installs, licenses, updates and governs Claudinite — is
[DESIGN.md](DESIGN.md). This paper covers only what that design does not decide: where the product
is sold, what each channel permits, and which pricing shapes the design can express. It presents
options; it chooses among them only where an owner decision is recorded inline.

Facts are cited from the publishers' own documentation. Pricing comparables come from search
snippets and are attributed rather than asserted.

---

## What GitHub Marketplace permits

Marketplace fits this product's shape: the thing being sold is scoped to repositories and
organisations, which is GitHub's own account model, and the GitHub App that carries a listing is the
same App that [DESIGN.md §8](DESIGN.md) makes the fleet.

- Paid listings are for **apps, not Actions**. The app must be owned by an organization that is a
  **verified publisher**, with a minimum of **100 installations** for a GitHub App (200 users for an
  OAuth app), and must handle `marketplace_purchase` webhooks for purchases, upgrades, downgrades,
  cancellations and trials.
- Plans are free, flat rate, or per-unit, where per-unit is *"a set fee … for each user in an
  organization"* — **there is no per-repository unit** — and there is **no metered billing**.
- Every plan needs both a monthly and an annual price. USD only. Up to 10 plans. Free trials are
  fixed at 14 days and auto-enrol; GitHub expects private customer data deleted within 30 days of a
  cancelled trial.
- GitHub retains **5%** of transaction income. Payout once monthly revenue reaches **$500**, at the
  end of the following month.

**Two rules constrain running two channels at once:** a free plan may not be listed in Marketplace
while the same thing is sold outside it, and once a free listing meets the paid requirements, a paid
plan must be offered in Marketplace.

**The one real friction:** the product's natural meter is repositories, and Marketplace counts only
users. Flat-rate bands by fleet size express that; anything finer bills outside Marketplace, subject
to the channel rules above.

---

## Pricing shapes, and what the design already supports

Entitlement is per account and per pack, so the free/paid line is a resolver decision: an unentitled
pack does not install, and says so.

| Shape | Marketplace | What it needs |
|---|---|---|
| Flat rate per account, banded by fleet size | Yes | The App's installation list is already the repository count |
| Per seat | Yes (per-unit) | A definition of "user". Claudinite's actors are agents; the honest proxies are organisation members committing to member repositories, or licence activations |
| Per repository | **No** | Bands, or billing outside Marketplace |
| Usage or per task-run | **No** | Direct billing plus metering the design does not otherwise require |
| Free single repository, paid organisation | Yes, as plans | A capability line rather than a count — the packs below |

**Where the line falls naturally**, because everything on the left needs nothing from us after
install and everything on the right needs cross-repository identity or aggregation:

| Free | Paid |
|---|---|
| Engine, `basics`, `claudinite-lifecycle` | `claudinite-fleet-sheepdog` — the fleet |
| Technology packs (`node`, `python`, `ios`, `android`, `flutter`, …) | `claudinite-growth` + `claudinite-canon-curation` — the growth lifecycle |
| `claudinite-dashboard` in repo mode | `claudinite-dashboard` in fleet mode |
| `claudinite-tasks` — arguable either way | An organisation's own registry namespace and policy |

A free single-repository tier costs nothing to serve once installed, and is what produces the 100
installations a paid GitHub App listing requires.

**Comparables** (search snippets, September 2026): CodeRabbit ~$24 per user/month annual; Greptile
free for one active developer, Pro ~$30 per seat/month with 50 review credits and $1 per extra;
Graphite roughly $24–$40 per user/month.

---

## Licensing the source

The repository carries no `LICENSE` file, so as a public repository it is already all rights
reserved. Closing it binds nobody retroactively: copies already taken, and forks, keep working.
*(Fork count unverified — `api.github.com` is proxy-blocked in the environment this was researched
from; it needs a human or an unblocked environment.)*

The terms have to permit what [DESIGN.md §7](DESIGN.md) requires: an entitled account reads pack
source and version diffs for security review, and may not publish them.

---

## Open commercial decisions

1. **Storefront** — GitHub Marketplace, direct billing, or both, subject to the channel rules above.
2. **Meter** — flat bands by fleet size, per seat, or per repository billed directly.
3. **Where the free line falls** — the pack split above, or a repository count, or a capability line.
4. **Whether the hosted aggregate view is part of a paid tier or a separate product.**

---

## Sources

- [Requirements for listing an app](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app)
- [Pricing plans for GitHub Marketplace apps](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/pricing-plans-for-github-marketplace-apps)
- [Billing customers](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/billing-customers) · [Receiving payment for app purchases](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/receiving-payment-for-app-purchases)
- [OIDC reference — token claims](https://docs.github.com/en/actions/reference/security/oidc)
- Pricing comparables, search snippets: [Greptile](https://www.greptile.com/content-library/best-ai-code-review-tools) · [tech-insider](https://tech-insider.org/coderabbit-vs-greptile-vs-qodo-2026/) · [Developers Digest](https://www.developersdigest.tech/blog/best-ai-code-review-tools-2026)
