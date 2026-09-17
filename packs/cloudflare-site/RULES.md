# Serving a site from Cloudflare

- **Adding a file the site serves** — put it under the tree the wrangler config's
  `assets.directory` names: that directory is the whole upload, so a file outside it is absent
  from the live site with no error anywhere, and a file under it that is documentation rather
  than page goes in `.assetsignore`.

- **Publishing the site from anywhere but the `site-release` task** — never: the task is what
  advances the version, gates on what has landed and parks where a person must act, and a second
  publisher has none of that while its green run looks exactly like success.

- **A release parked** — the lane is the diagnosis: `action` is a credential, a scope, the zone,
  or a record the previous host left on a claimed hostname; `decision` is a surface the release
  depends on changing underneath it; `failure` means read the trace. The
  `releasing-a-cloudflare-site` skill says what each one wants.
