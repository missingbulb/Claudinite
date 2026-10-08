## 2026-09-23 · born · Author cloudflare-site/internal-links-omit-html-extension as a check (#2129)
- **Source:** MissingBulbWebsite's local pack, where the same scan existed hardcoded to `site/`.
- **Reason:** the prose fires at the moment a link is written; nothing was reading the links already
  committed, and a redirect is invisible on the page that pays for it.
- **Actor:** the `engine/implement-request` run on #2129, an owner-marked request.
- **Model:** claude-opus-5
- **Mechanism:** a world check over the `.html` files under `assets.directory`, generalized off the
  wrangler config rather than a fixed `site/`, and silent where `html_handling` is `none` -
  Cloudflare's own routing table shows the extensionless path resolving through `not_found_handling`
  in that mode, so the remedy would break the link it flagged.
- **Rejected:** dropping the prose. The check reads committed pages only, so a link written into a
  template, a generator or a source outside the published tree still needs the rule.
- **Retire when:** Workers static assets stops redirecting the `.html` form.
