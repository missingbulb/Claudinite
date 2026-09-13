# Serving a site from Cloudflare

- **Adding a file the site serves** — put it under the tree the wrangler config's
  `assets.directory` names, since that directory is the whole upload and a file outside it is
  simply absent from the live site with no error anywhere; a file under it that is
  documentation rather than page goes in `.assetsignore`.

- **Writing a version number into a page** — don't: `title="version …"` is generated from
  `package.json` by the pack's bump, and a hand-edited stamp names a build that was never
  served. Repair a drifted one, consuming no version number, with

  ```
  node .claudinite/shared/packs/cloudflare-site/bump-version.mjs --stamp-only
  ```

- **Publishing the site from anywhere but the `site-release` task** — never: the task is what
  cuts the version, gates on what has landed and parks where a person must act, and a second
  publisher has none of that while its green run looks exactly like success.

- **A release parked** — the lane is the diagnosis and the comment names the object: `action` is
  a credential, a scope, the zone, or a record the previous host left on a claimed hostname;
  `decision` is a surface the release depends on changing underneath it; `failure` means read
  the trace. The `releasing-a-cloudflare-site` skill says what each one wants.
