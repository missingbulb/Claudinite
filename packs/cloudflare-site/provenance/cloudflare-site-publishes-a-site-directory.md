## 2026-09-13 · born · converted from references.md (check:cloudflare-site/publishes-a-site-directory)
- **Reason:** `assets.directory` is the only boundary between the published site and the repo
  holding the vendored mount, the packs and the queue's workers. Widening it to the repo root
  publishes all of that to a public URL, and the deploy reports success either way.
- **Mechanism:** a check
- **Retire when:** Retire the check if a Cloudflare deployment ever gains a second, independent
  statement of what is uploaded.
