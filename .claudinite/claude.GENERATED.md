<!-- GENERATED — do not hand-edit. Rendered from this repo's pack declaration by
     Claudinite's engine/pack_loader/generate-claude-index.mjs, rewritten by every
     converge (the nightly update and any pack change). Edit a pack's RULES.md instead. -->

# Claudinite — active-pack guidance

The baseline plus the packs this project declares, imported so their rules load with
this file rather than through a hook's stdout (#807). Deeper per-pack reference (e.g. a
pack's release doc) is linked from its prose and read on demand.

- **`basics`** — @../packs/basics/RULES.md
- **`claude-code-web-users-support`** — @../packs/claude-code-web-users-support/RULES.md
- **`tidy-repo`** — @../packs/tidy-repo/RULES.md
- **`claudinite`** (local) — @local/packs/claudinite/RULES.md

---

# Claudinite — where content goes (pack routing)

Each pack states what it owns and what it does not. When a rule, doc, skill or check could live in more than one, this table decides it — and "no pack fits" means a new pack or the project's own `local/packs/`, never the baseline by default.

The packs listed are the ones this repo holds; the full directory of every pack it could adopt from Claudinite is `packs/directory.GENERATED.md` — read it when weighing what to adopt.

| Pack | Belongs | Does not belong |
|---|---|---|
| `android` | gradle/AGP builds, AndroidManifest, permissions, signing configs, product flavors and emulator workflows for an Android app module | store submission and release cadence — play-store-release; Flutter-side widget or Dart code — flutter |
| `app-store-release` | shipping to the Apple App Store: App Store Connect, provisioning, App Attest, TestFlight, review guidelines, release cadence | iOS coding, Info.plist and Xcode project practices — that is ios; backend environment split — firebase-release |
| `aws-sam` | serverless AWS stacks: SAM template shape, Lambda handler paths, esbuild bundling, API Gateway and CloudFront gotchas | backend Google ID token validation — google-identity; generic Node packaging habits — node |
| `barriers` | directed folder-access graph rules — which directories may never reference which, plus the exceptions each rule allows | where a file should live or naming conventions — that is basics file-placement, not an access barrier |
| `basics` | cross-project working discipline, issue-branch-PR lifecycle, repo hygiene, doc/reference integrity and the baseline engineering, testing and debugging skills | technology-specific content — its own tech pack; GitHub Actions workflow or platform behaviour — github-actions; git procedure — git-github |
| `chrome-extension` | manifest V3 service-worker, permissions, content-script and extension-auth gotchas that apply while coding a Chrome extension | store submission, packaging, versioning and privacy disclosure — that is chrome-extension-release |
| `chrome-extension-release` | store publication for a Chrome extension: release workflows, package versioning, release config, privacy and permission disclosure | extension coding and MV3 runtime gotchas — chrome-extension; generic workflow lint rules — github-actions |
| `claude-code-web-users-support` | what a project offers people working from Claude Code on the web, where the session knows who they are | project conventions and process — those are the packs that own each subject |
| `executable-requirements` | running a numbered spec as tests: dev/requirements layout, requirement ids, kinds, coverage and gallery gates, determinism rules | doc-first judgment, owner-owned expecteds and honest-gap tracking — spec-driven-product; general test practice — basics writing-tests |
| `firebase` | building on Firebase: Firestore security rules, callable Cloud Function patterns, FCM, emulator testing, functions deploy layout | dev/prod project separation, config injection and App Check store gating — that is firebase-release |
| `firebase-release` | dev/prod Firebase project split, committed-default-dev discipline, pipeline-injected prod config, App Check attestation gating, promotion cadence | everyday Firestore rules, function patterns and deploy layout — firebase; app store submission — play-store-release, app-store-release |
| `flutter` | widget-tree architecture, ports and fakes, widget-test and golden mechanics, pub and analyze toolchain habits for Flutter | native Android or iOS module concerns — android and ios; store shipping — play-store-release, app-store-release |
| `git-github` | git and GitHub procedure: commit layering, branch and merge mechanics, squash-merge recovery, PR and merge-to-main commands | the issue-branch-PR lifecycle rules themselves — basics; workflow YAML and Actions runtime behaviour — github-actions |
| `github-actions` | workflow YAML and Actions runner platform behaviour: triggers, secrets, permissions, scheduling, artifacts, reusable workflows and their pitfalls | git and GitHub command procedure — git-github; release pipeline content for one product — its release pack |
| `google-identity` | server-side Google Sign-In ID token validation: audience pinning, issuer and email_verified checks, JWT authorizer/OIDC verifier config | obtaining the token in a browser or extension client — chrome-extension; Firebase Auth usage — firebase |
| `grow_with_claudinite` | rules and tasks for capturing lessons into local packs — extraction, dedup, conversation logs, skill-usage folding | repo housekeeping of issues, PRs and branches — that is tidy-repo; cross-repo fleet sweeps are sheepdog |
| `html` | hand-authored HTML markup gotchas — element nesting, injected content placement, live browser verification of a page | javascript runtime APIs — web-speech; map widgets — leaflet; npm and dependency policy — node |
| `ios` | app-target conventions for iOS — Xcode project, Info.plist usage strings, entitlements, code signing | shipping builds to the App Store — that is app-store-release; Android equivalents are android |
| `jwt` | minting and validating JSON Web Tokens: algorithm pinning, claim validation, key strength and secrecy, expiry, JWE | the Google-issuer validator config — google-identity; OAuth client-side token acquisition — chrome-extension |
| `leaflet` | map rendering with the Leaflet library — map init options, tile layers, markers and divIcons, CDN plugin pinning | generic HTML markup rules — that is html; non-map dependency policy belongs to node |
| `macos` | native macOS apps: app-bundle assembly, TCC usage strings, Hardened Runtime entitlements, Developer ID signing, notarization and DMG distribution | Mac App Store submission — app-store-release; iPhone app targets — ios; workflow YAML mechanics — github-actions |
| `node` | conventions for a Node/npm project — module resolution, ESM vs CJS, dependency justification, jsdom test divergences | browser-runtime API behaviour — that is html or web-speech; Python packaging is python |
| `play-store-release` | shipping an Android app to Google Play — Play Console, signing, integrity, staged rollout | day-to-day Android or iOS coding rules — those are android and ios; Apple shipping is app-store-release |
| `product-wiki` | agent-maintained market, user and competitor research wikis — cited pages, growth logs, the reviewed product-requirements sink | how the product is built or specced — that is spec-driven-product; requirement proofs are executable-requirements |
| `python` | packaging and import conventions for a Python project — pyproject extras, lazy optional heavy deps, stdlib-only core | npm and module packaging — that is node; research methodology is research-project |
| `research-project` | methodology for iterating an algorithm over sample inputs against annotated ground truth — scoring, phases, session continuity | shipping an end-user product against a spec — that is spec-driven-product; market research is product-wiki |
| `sheepdog` | fleet-enforcer duties for the repo watching every other repo — coverage, freshness, usage, the packs the fleet standardizes on | anything a member does to itself — tidying is tidy-repo, lesson capture is grow_with_claudinite |
| `spec-driven-product` | playbook for shipping a small end-user product from an executable spec — leaf claims, owner-owned expecteds, green-main releases | the requirements file format and coverage gates — that is executable-requirements; research wikis are product-wiki |
| `static-website` | shipping and serving a static site: date-anchored versioning, release on push, the publish set, Pages deploy, client-side caching | hand-authored markup gotchas — html; generic workflow lint — github-actions; store publication — the release packs |
| `tidy-repo` | housekeeping of open issues, pull requests and branches in one repo — triage verdicts, standing trackers, assess-vs-act policy | extracting lessons into packs — that is grow_with_claudinite; cross-repo fleet sweeps are sheepdog |
| `web-scraping` | acquiring data from a site you do not own: finding its data surface, fetching defensively, caching raw payloads | Actions triggers and secrets wiring — that is github-actions; publishing a site you own — that is static-website |
| `web-speech` | browser voice I/O gotchas — SpeechRecognition results and errors, speechSynthesis and chrome.tts, mic permission and lifecycle | general MV3 service-worker and content-script mechanics — that is chrome-extension; page markup is html |
| `canon-curation` (local) | fleet-facing curation of the shared corpus — promoting member lessons into packs/, sweeping the fleet stack, policing packs/ | working rules for developing Claudinite itself — that is the claudinite local pack; a member tidying itself — tidy-repo |
| `claudinite` (local) | working rules and lessons specific to developing Claudinite itself and not portable to any consumer | fleet-facing curation duties and policing of the packs/ tree — that is the canon-curation local pack |
