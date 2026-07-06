# Chrome extension — release & Chrome Web Store publication standard

Every Chrome-extension repo of ours ships the **same** release pipeline: same workflows, same
Chrome Web Store API usage, same secrets, same versioning and artifact rules, same README install
sections. This doc is that contract, the setup steps for a new extension repo, and the manual
Chrome Web Store actions the automation can't do. The workflow **logic** lives once, in this
repo's [.github/workflows/](../.github/workflows/), as `workflow_call`-only **reusable
workflows** (plus the [report-failure](../.github/actions/report-failure/action.yml) composite
action); each extension repo carries only four **thin stubs** — triggers + repo values —
templated in [chrome-extension-release/](chrome-extension-release/): **copy the stubs, don't
re-derive them**. The stubs reference the canon `@main`, so a merged canon change reaches every
extension repo's next run automatically — changing the standard's logic needs no per-repo PR;
only a change to the *stub shape itself* still propagates by hand. Reference implementation:
`missingbulb/GoogleCalendarEventCreator`; also adopted by `TLDR` and `CrosswordChat`.

Naming in the flat `.github/workflows/` namespace: Chrome-specific logic carries the
`chrome-extension-` prefix (future publish standards — other stores — will live beside it);
genuinely platform-agnostic pieces (`deploy-privacy-page.yml`, the `report-failure` action) keep
general names so other standards reuse them as-is. When in doubt, prefix.

## The contract

**Versioning**

- The extension manifest's `version` (`X.Y.Z`) is the single source of truth. The extension's
  `package.json` `version` must equal it, enforced by a CI-run guard (a unit test or an inline
  workflow check — the repo picks the mechanism, the invariant is fixed).
- Minor/major bumps are deliberate and human: **"bump version"** = edit the manifest and
  `package.json` (plus any repo version-sync constant) together on a branch — default the next
  **minor** — and land on `main` via a normal PR. Merging the bump *is* cutting the release.
- Patch bumps belong to the daily auto-release. No workflow other than the daily bump ever
  changes the version; "Release: Create Package" never does.

**Artifact**

- `npm run build` at the repo root produces `dist/<zip>`, where `<zip>` is the **kebab-cased repo
  name** + `.zip` (e.g. `google-calendar-event-creator.zip`, `tldr.zip`, `crossword-chat.zip`) —
  stable, never version-stamped, so
  `https://github.com/<owner>/<repo>/releases/latest/download/<zip>` is a permanent
  newest-build URL. `manifest.json` sits at the zip's top level.
- The zip's contents come from a single shipping-set source of truth in `dev/build/release/`,
  drift-guarded by a test — nothing dev/test-only ships, and a renamed runtime file fails the
  build rather than silently dropping out of the package.
- A release is GitHub Release **`vX.Y.Z`**, tagged at the released commit, with the zip as its
  only asset and auto-generated notes.

**Workflows** — four stub files per repo with these exact `name:`s (the failure reporter keys
tracking issues on them), each calling its reusable canon workflow:

| stub file | `name:` | trigger (owned by the stub) | canon workflow it calls — what it does |
|---|---|---|---|
| `release.yml` | Release: Create Package | push to `main` touching the manifest; dispatch | `chrome-extension-release.yml` — version guard (clean no-op if already released) → full test gate → build → GitHub Release |
| `publish-chrome-store.yml` | Release: Publish to Chrome Web Store | dispatch(`tag`, `auto_publish`) | `chrome-extension-publish-store.yml` — download the release zip → upload via the store API (publish to users unless `auto_publish: false` → dashboard draft) → refresh the privacy page |
| `daily-release.yml` | Release: Daily Auto-Release | schedule `0 3 * * *`; dispatch | `chrome-extension-daily-release.yml` — shipped-file diff vs the latest release tag → patch bump pushed to `main` → calls the two canon workflows above |
| `deploy-privacy-page.yml` | Deploy privacy policy to GitHub Pages | dispatch | `deploy-privacy-page.yml` — publishes `store_artifacts/PRIVACY.md` at the `/privacy/` permalink |

- Repo-specific values travel as `with:` inputs — `zip_path`/`zip_name`, `manifest_path`, and
  (only where the repo deviates from the defaults) `package_json_path`, `setup_command`,
  `test_command`, `build_command`, `build_env` (KEY=VALUE lines exported to test/build; every
  listed key must be non-empty or the run fails — how a repo injects release config from
  repository variables without ever shipping a placeholder zip). Store secrets travel via
  `secrets: inherit`.
- Every unattended workflow (all of the above; not PR CI) reports failures through the
  `report-failure` composite action baked into the canon workflows — a red run must reach a
  human as a standing per-workflow `workflow-failure` tracking issue, never sit unseen in the
  Actions list. Repos no longer carry a `report-failure.yml`; a repo's own non-standard
  unattended workflows use the action directly
  (`uses: missingbulb/Claudinite/.github/actions/report-failure@main`).
- Daily auto-release semantics: the baseline is the **latest release tag**, not a 24-hour window
  (self-healing after a failed day); "deployable" = membership in the shipping set; the patch
  bump is pushed straight to `main` (`[skip ci]`) because the store rejects a version that isn't
  strictly higher; release + publish are invoked via `workflow_call` because a `GITHUB_TOKEN`
  push triggers no workflows. Days with no shipped-file change are a clean no-op.
- The patch-bumper and shipped-paths filter run on a bare runner (no `npm ci`), so both scripts
  must be dependency-free Node.
- Until the four store secrets exist, the publish leg fails **loudly** (a fail-early step lists
  the missing names, and the tracking issue nags) — that is the designed state for a repo that
  hasn't finished its first manual publication; releases and zips still work.

**Chrome Web Store API** — uploads go through `chrome-webstore-upload-cli@3`
(`npx --yes chrome-webstore-upload-cli@3 upload --source dist/<zip> [--auto-publish]`), which
reads env `EXTENSION_ID` / `CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` — set from the four
repository **secrets**, same names in every repo:
`CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.

**Privacy page** — the policy source is `dev/build/release/store_artifacts/PRIVACY.md`; a Jekyll
`permalink: /privacy/` pins the public URL `https://<owner>.github.io/<repo>/privacy/`
independent of the file's location. The store listing's Privacy-tab URL points **there**, never
at a `blob/main` link. The page redeploys on every store publish and by standalone dispatch.
One-time: repo Settings → Pages → Source = "GitHub Actions".

**The submission kit** — `dev/build/release/store_artifacts/STORE-LISTING.md` pre-writes every
answer the dashboard asks for: the listing copy (name, summary, detailed description, category),
the graphic-asset file map, and the Privacy-practices answers — the single-purpose statement, a
justification for **every** permission the manifest requests (`permissions`, `host_permissions`,
and `optional_*` alike), the remote-code answer, the data-usage declarations and certifications,
the privacy-policy URL — plus notes for the Google reviewer. The dashboard is filled **from**
this file, at the initial submission and at every resubmission; it must never lag the manifest.

**Store assets & icons** — required inventory: a 128 px store icon; the manifest icons the
extension ships (16/32/48/128), living inside the extension source where the manifest points;
at least one 1280×800 (or 640×400) screenshot; optionally 440×280 small and 1400×560 marquee
promo tiles. Listing-only images live in `store_artifacts/`; shipped icons live in the extension
source. Every asset comes from a **committed, deterministic generator script** — regenerate and
commit, never hand-edit a generated PNG. The generator's tech is the repo's choice (the
reference repo draws with stdlib-only Python; CrosswordChat rasterizes SVG/HTML with headless
Chromium); what's fixed is that every asset is reproducible from the repo.

**Layout** — release machinery lives in `dev/build/release/`: the zip builder + shipping-set
module, the patch-bumper, the shipped-paths filter (each with tests), `releasing.md` (the repo's
own release doc: its concrete names/paths/listing facts, delegating the shared procedure to this
guide), and `store_artifacts/` (PRIVACY.md, the STORE-LISTING.md submission kit, listing
screenshots, icon/asset generators).

## README template

Every extension repo's README carries these two sections, same wording, repo values filled in:

```markdown
## Install

**[Install from the Chrome Web Store →](<store listing URL>)**

Or load the latest development build:

1. Download [the latest release zip](https://github.com/<owner>/<repo>/releases/latest/download/<zip>)
   and extract it — it unpacks to a folder with `manifest.json` at its top.
2. Open `chrome://extensions`, enable **Developer mode** (top right), click
   **Load unpacked**, and select that folder.

## Releasing

The version users see is [`<manifest path>`](<manifest path>)'s `version`. Merging a version
bump to `main` cuts GitHub Release `vX.Y.Z` with `<zip>` attached, and the daily auto-release
ships shipped-file changes to the Chrome Web Store on its own (patch-bumping as needed). Full
procedure: [dev/build/release/releasing.md](dev/build/release/releasing.md).
```

Until the extension's first store publication, replace the store line with:
*Not yet on the Chrome Web Store — the listing goes live after the first manual publish (see
[dev/build/release/releasing.md](dev/build/release/releasing.md)).*

## Setting up a new extension repo

1. Copy the four stub files from [chrome-extension-release/](chrome-extension-release/) into
   `.github/workflows/`. Replace every `__ZIP_NAME__` / `__BUMP_PATCH_CMD__` /
   `__FILTER_SHIPPED_CMD__` token, and — only if the repo deviates from the defaults — set the
   `with:` overrides flagged in each stub's header (`manifest_path`, `package_json_path`,
   `setup_command`, `test_command`, `build_command`, `build_env`), the same values in
   `release.yml` and `daily-release.yml`. Grep for `__` afterwards; no token may survive.
2. Create `dev/build/release/` — zip builder + shipping-set module, dependency-free patch-bumper
   and shipped-paths filter, tests for each, `releasing.md`, and `store_artifacts/` with
   `PRIVACY.md` and the `STORE-LISTING.md` submission kit — adapting from the reference repo's
   `dev/build/release/`.
3. Wire `npm run build` to the zip builder; add the two README sections above.
4. One-time GitHub setup: Pages → Source = "GitHub Actions". The four `CHROME_*` secrets come
   later, after the first manual publish. (Once per *account*, not per repo: if Claudinite is
   private, its reusable workflows must be callable — Claudinite Settings → Actions → General →
   Access → "Accessible from repositories owned by the user"; nothing to do if it's public.)
5. Do the first manual publication (below). From then on the daily pipeline owns routine
   shipping.

## Manual actions — publishing to the Chrome Web Store

The steps the automation cannot do, distilled from the path actually run for the reference
extension; the upstream reference is
[Using the Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using-api).

### First publication (once per extension)

1. Register a developer account at the
   [developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).
2. **Add new item** → upload the release zip. If the extension pins its ID with a manifest
   `key` (needed when OAuth redirect URIs depend on a stable ID — see
   [chrome-extension.md](chrome-extension.md)), the **first** upload must NOT contain the
   `key`: the store assigns the ID at first upload, and you copy the dashboard's Package-tab
   public key back into the build afterwards. Record the 32-char item ID → the
   `CHROME_EXTENSION_ID` secret.
3. Complete the listing — 128px store icon, description, category, ≥ 1280×800 screenshot — by
   pasting from the repo's submission kit (`store_artifacts/STORE-LISTING.md`).
4. Privacy tab: paste the kit's single-purpose statement, per-permission justifications, and
   data-usage declarations; set the **Privacy policy** field (bottom of the tab) to the
   `/privacy/` Pages URL. **Before submitting**: deploy the privacy page via the privacy
   workflow's dispatch, load the URL in a browser to confirm it's live, and paste that exact
   permalink — never a guessed path. Google re-fetches this URL on **every** publish, and an
   unreachable link fails the publish (see [When a store publish fails](#when-a-store-publish-fails)).
5. Submit for review — approval takes hours to a few days (`ITEM_PENDING_REVIEW` = success).
   While the item is **pending review the API rejects uploads** — hold the pipeline dry run
   until the first review completes. Every subsequent upload must carry a **strictly higher**
   version, which is why the pipeline always bumps before it ships; a "version must be
   greater" rejection on a dry run is a **pass** — it proves the credential wiring works
   end to end.

### Minting the API credentials (once per extension)

Browser-only — no local tooling needed. Two standing rules for every step below:

- Every "sign in with Google" must use the **same Google account that owns the store listing**,
  and will hit a **"Google hasn't verified this app"** interstitial — click **Advanced** →
  **"Go to \<app\> (unsafe)"** → **Allow**. That's fine and permanent: you are this OAuth app's
  only user, so **ignore every verification prompt and never start verification** — an
  unverified app's tokens work indefinitely.
- Before acting on any Cloud-console page, confirm the **top-bar project picker** shows the
  project created in step 1.

**Google Cloud setup:**

1. **Create a project**: <https://console.cloud.google.com/projectcreate> — any name, keep
   "No organization" → **Create**. Confirm the top-bar project picker switched to it.
2. **Enable the Chrome Web Store API**:
   <https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com> → **Enable**.
3. **Configure the OAuth consent screen** (the console now brands this "Google Auth
   Platform"): <https://console.cloud.google.com/auth/overview> → **Get started** → app name +
   support email → Audience: **External** → contact email → agree → **Create**.
4. **Publish the app to production**: <https://console.cloud.google.com/auth/audience> →
   **Publish app** → **Confirm**. Left in "Testing", refresh tokens silently expire after
   7 days — the unattended daily release dies a week later.
5. **Create the OAuth client**: <https://console.cloud.google.com/auth/clients> → **Create
   client** → type **Web application** (NOT Desktop — Desktop clients can't take custom
   redirect URIs; the client type makes no difference to `chrome-webstore-upload-cli`, the
   refresh-token grant is identical) → add authorized redirect URI exactly
   `https://developers.google.com/oauthplayground` → **Create**. The client ID and secret are
   `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET`.

**Mint the refresh token in the OAuth 2.0 Playground:**

1. Open <https://developers.google.com/oauthplayground> → gear icon (top right) → check
   **Use your own OAuth credentials** → paste the client ID + secret.
2. In Step 1, ignore the API list: type `https://www.googleapis.com/auth/chromewebstore` into
   **Input your own scopes** → **Authorize APIs** → sign in as the listing owner → past the
   unverified interstitial → **Allow**.
3. Step 2 → **Exchange authorization code for tokens** → copy the **Refresh token** (starts
   `1//`). Ignore the access token — it expires hourly; the CLI mints its own.
4. **Empty Refresh-token field?** Consent wasn't force-prompted: in the gear panel set
   **Force prompt: Consent** and redo the authorize step.

Add all four values as repository secrets at
`https://github.com/<owner>/<repo>/settings/secrets/actions/new`:
`CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.

**Alternative — local Node**: `npx chrome-webstore-upload-keys` walks the same flow from a
terminal (it needs the client to be a **Desktop app**, whose `http://localhost` redirect it
uses). Use it only when a Node-equipped machine is at hand; the Playground route above is the
default because it assumes nothing about the operator's machine.

### Routine shipping

- Nothing to do for accumulated work: the daily auto-release ships any day whose merges touched
  shipped files, on its own patch bump.
- A deliberate release now: **"bump version"** (default minor) → merge the PR (that cuts the
  GitHub Release) → run **Release: Publish to Chrome Web Store** from its dispatch page,
  `https://github.com/<owner>/<repo>/actions/workflows/publish-chrome-store.yml` (blank
  tag = latest release).
- Once the store approves, Chrome auto-pushes the update to installed users within hours — no
  reinstall.

### When a store publish fails

- **HTTP 400 `Publish condition not met: Privacy policy link is not reachable.`** — Google
  fetches the listing's privacy-policy URL at publish time, and re-checks it on **every**
  publish. Fix it on the item's **Privacy** tab in the
  [developer dashboard](https://chrome.google.com/webstore/devconsole)
  (`https://chrome.google.com/webstore/devconsole/<publisher-id>/<item-id>/edit/privacy`,
  bottom field, "Privacy policy"): set it to the exact live `/privacy/` permalink → **Save
  draft** → re-run the publish.
- **Upload rejected while `ITEM_PENDING_REVIEW`** — the API can't upload while a review is in
  flight; wait for the review to complete, then re-run.
- **"version must be greater" than the live one** — expected whenever the zip's version isn't
  strictly higher; on a credentials dry run this is success, otherwise let the daily bump (or
  "bump version") raise it first.

### When a change touches the extension's permissions

Any PR that changes the manifest's `permissions`, `host_permissions`, or `optional_*`:

1. Update the justification table in the repo's `store_artifacts/STORE-LISTING.md` in the
   **same PR** — the store requires a written justification for every requested permission, so
   the answer must exist before anyone faces the dashboard.
2. Open a tracking issue for the manual dashboard step: the Privacy-practices tab must carry
   the new justification, and the store blocks publishing the new version until it does — so
   the next store publish (daily or manual) stalls on it. (If the daily pipeline hits it first,
   the failed publish lands on its `workflow-failure` tracking issue; the proactive issue beats
   the reactive one.) After updating the dashboard, re-run the publish.
3. Expect deeper store review than a plain code update — permission changes re-open scrutiny.
4. A new **required** permission that carries an install-time warning disables the extension
   for existing users until each one re-approves it — prefer `optional_permissions` /
   `optional_host_permissions` requested at runtime (`chrome.permissions.request`) when the
   feature allows.
