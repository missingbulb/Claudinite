# Chrome extension — release & Chrome Web Store publication standard

Every Chrome-extension repo of ours ships the **same** release pipeline: same workflows, same
Chrome Web Store API usage, same secrets, same versioning and artifact rules, same README install
sections. This doc is that contract, the setup steps for a new extension repo, and the manual
Chrome Web Store actions the automation can't do. The canonical workflow files live in
[chrome-extension-release/](chrome-extension-release/) — **copy them, don't re-derive them**.
Reference implementation: `missingbulb/GoogleCalendarEventCreator`; also adopted by `TLDR` and
`CrosswordChat`. When the standard changes, change it here first, then propagate to every
extension repo.

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

**Workflows** — five files with these exact `name:`s (the failure reporter keys tracking issues
on them):

| file | `name:` | trigger | what it does |
|---|---|---|---|
| `release.yml` | Release: Create Package | push to `main` touching the manifest; dispatch; `workflow_call(ref)` | version guard (clean no-op if already released) → full test gate → `npm run build` → GitHub Release |
| `publish-chrome-store.yml` | Release: Publish to Chrome Web Store | dispatch(`tag`, `auto_publish`); `workflow_call` | download the release zip → upload via the store API (publish to users unless `auto_publish: false` → dashboard draft) → refresh the privacy page |
| `daily-release.yml` | Release: Daily Auto-Release | schedule `0 3 * * *`; dispatch | shipped-file diff vs the latest release tag → patch bump pushed to `main` → calls the two workflows above |
| `deploy-privacy-page.yml` | Deploy privacy policy to GitHub Pages | dispatch; `workflow_call` | publishes `store_artifacts/PRIVACY.md` at the `/privacy/` permalink |
| `report-failure.yml` | Report workflow failure | `workflow_call(workflow)` | opens/appends the standing per-workflow `workflow-failure` tracking issue |

- Every unattended workflow (all of the above; not PR CI) carries a `report-failure` job — a red
  run must reach a human as an issue, never sit unseen in the Actions list.
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

**Layout** — release machinery lives in `dev/build/release/`: the zip builder + shipping-set
module, the patch-bumper, the shipped-paths filter (each with tests), `releasing.md` (the repo's
own release doc: its concrete names/paths/listing facts, delegating the shared procedure to this
guide), and `store_artifacts/` (PRIVACY.md, listing screenshots, icon/asset generators).

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

1. Copy the five workflow files from [chrome-extension-release/](chrome-extension-release/) into
   `.github/workflows/`. Replace every `__ZIP_NAME__` / `__BUMP_PATCH_CMD__` /
   `__FILTER_SHIPPED_CMD__` token, and — only if the extension doesn't live at `extension/` —
   the manifest/`package.json` paths flagged in each file's header. Grep for `__` afterwards; no
   token may survive.
2. Create `dev/build/release/` — zip builder + shipping-set module, dependency-free patch-bumper
   and shipped-paths filter, tests for each, `releasing.md`, and `store_artifacts/PRIVACY.md` —
   adapting from the reference repo's `dev/build/release/`.
3. Wire `npm run build` to the zip builder; add the two README sections above.
4. One-time GitHub setup: Pages → Source = "GitHub Actions". The four `CHROME_*` secrets come
   later, after the first manual publish.
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
3. Complete the listing: 128px store icon, description, category, ≥ 1280×800 screenshot. Keep
   the submission copy (descriptions, justifications, reviewer notes) in
   `dev/build/release/store_artifacts/` so a resubmission is copy-paste.
4. Privacy tab: justify each requested permission, declare data usage, and set the **Privacy
   policy URL** to the `/privacy/` Pages URL — deploy it first via the privacy workflow's
   dispatch so the URL is live when the reviewer clicks it.
5. Submit for review — approval takes hours to a few days (`ITEM_PENDING_REVIEW` = success).
   Every subsequent upload must carry a **strictly higher** version, which is why the pipeline
   always bumps before it ships.

### Minting the API credentials (once per extension)

In a Google Cloud project: enable the **Chrome Web Store API**; **publish** the OAuth consent
screen — left in "Testing", it issues refresh tokens that silently expire after 7 days and break
the publish workflow a week later; create a **Desktop app** OAuth client → `CHROME_CLIENT_ID` /
`CHROME_CLIENT_SECRET`. Then mint the refresh token by hand (Google blocks the out-of-band flow,
so the Desktop client's `http://localhost` redirect is required and step 2 reads the code out of
a failing redirect):

```sh
export CHROME_CLIENT_ID="…"
export CHROME_CLIENT_SECRET="…"

# 1. Open this URL (incognito, signed into only the developer account), approve.
echo "https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent&redirect_uri=http://localhost&client_id=${CHROME_CLIENT_ID}"

# 2. The browser redirects to http://localhost/?code=… and FAILS TO LOAD (expected).
#    Copy the code= value out of the address bar.
export CHROME_AUTH_CODE="…"

# 3. Exchange it for the refresh token (the code is single-use).
curl -s "https://accounts.google.com/o/oauth2/token" \
  -d "client_id=${CHROME_CLIENT_ID}" \
  -d "client_secret=${CHROME_CLIENT_SECRET}" \
  -d "code=${CHROME_AUTH_CODE}" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=http://localhost" | jq -r .refresh_token
```

The printed string is `CHROME_REFRESH_TOKEN`. Add it plus the other three as the repository
secrets. If minting fails:

| Symptom | Fix |
| --- | --- |
| `access_denied` / "app is being tested" | Add yourself as a test user, or **publish** the consent screen. |
| `invalid_request` / "OOB flow blocked" | Use a Desktop client (`http://localhost` redirect), not `urn:ietf:wg:oauth:2.0:oob`. |
| `500` on the consent page | Retry in an incognito window signed into a single account. |
| `invalid_grant` at token exchange | The authorization code is stale/used — restart the flow for a fresh one. |

### Routine shipping

- Nothing to do for accumulated work: the daily auto-release ships any day whose merges touched
  shipped files, on its own patch bump.
- A deliberate release now: **"bump version"** (default minor) → merge the PR (that cuts the
  GitHub Release) → run **Release: Publish to Chrome Web Store** from the Actions tab (blank
  tag = latest release).
- Once the store approves, Chrome auto-pushes the update to installed users within hours — no
  reinstall.
