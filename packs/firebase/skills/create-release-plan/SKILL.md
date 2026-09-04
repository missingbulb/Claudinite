---
name: create-release-plan
description: The Firebase release standard — two separate dev/prod projects with the committed default pinned to dev, prod config injected only by the release pipeline, App Check attestation gating, and deliberate promotion. Use when planning a Firebase-backed app's first release, splitting a project into dev and prod, wiring prod config and App Check into a release pipeline, or editing firebase.json or .firebaserc.
metadata:
  force-load-on-file-edits-paths:
    - ".firebaserc"
    - "firebase.json"
---

# Planning a Firebase release — environments, provenance, attestation

This standard was decided ahead of its first exercise: refine it on the first real release rather than
treating it as settled canon.

## 1. The committed default is dev, always

- **Two fully separate Firebase projects** — dev and prod. Isolation is at the project boundary
  (data, auth, quotas, keys).
- **Everything committed points at dev**: `.firebaserc`'s `default` alias, the checked-in client
  `firebase_options`, every documented command. Strongest form: **no prod alias committed at
  all** until the release milestone — no command run from the repo can reach prod by accident.
- **Dev builds coexist with prod installs** (Android `applicationIdSuffix .dev` / iOS bundle-id
  suffix) so testing on a real phone never displaces the store app.
- **Guard tests pin the contract** once prod exists: the committed client config's projectId must
  be the dev project (TLDR pins the equivalent in `client/test/inject-config.test.mjs`), and seed
  scripts hard-refuse prod targets.

## 2. Prod config is release-pipeline-injected

- The store artifact gets its prod `firebase_options` (and any prod-only identifiers) from
  **release-workflow variables**, never from the tree. A plain/local/CI build physically lacks
  prod coordinates.
- **The release workflow fails if any injected variable is unset** — a dev-pointed or
  placeholder-configured artifact must be unbuildable, not merely unlikely.
- The same artifact that goes to the store is the release download — one prod build, one
  provenance trail.

## 3. Attestation beats provenance

- Provenance (only the pipeline holds prod config) is necessary but not sufficient — anyone can
  extract config from a shipped APK/IPA. Close the gap: **enforce App Check on the prod project**
  (Firestore, Functions, Storage) with Play Integrity (Android) / App Attest (iOS), so requests
  without a store-signed attestation are rejected server-side.
- **Dev keeps the App Check debug provider** so emulators, tests, and local builds stay
  friction-free; enforcement is a per-project switch, which is precisely why prod must be a
  separate project.
- Register the store apps in the Firebase console at first release; until enforcement is ON,
  treat prod as provenance-only and say so in the project's environments doc.

## 4. Promotion is deliberate; dev deploys are automatic

- Dev auto-deploys from `main` (it is the always-current sandbox); **prod deploys are a manual,
  explicit promotion** of something already verified in dev — a workflow dispatch or a named
  command, never a side effect.
- Per-environment deploy credentials: the prod deploy identity is distinct from dev's, so a
  compromised or misconfigured dev lane cannot touch prod.
- Data hygiene follows the project split: seed/backfill tooling targets dev by name and refuses
  the prod project id as a hard guard, not a convention.

## 5. Deploy layout and aliases

- **Keep the Firebase project root self-contained** — the directory holding `firebase.json`, its
  `.firebaserc`, rules/indexes, and `functions/`. That root may be the repo root or a dedicated
  subfolder (e.g. `firebase/`); the CLI walks up to find `firebase.json` and resolves every path
  inside it *relative to that file*, so a subfolder needs no path edits — just run deploys from it
  (or pass `--config <dir>/firebase.json`). Keep compiled output (`functions/lib/`) and
  `.firebase/` gitignored.
- **Commit `.firebaserc` with named aliases and make the default the safe target** (§1 above is
  the full environment discipline). Deploy commands in docs always name
  what they deploy (`--only functions,firestore`). (4)
