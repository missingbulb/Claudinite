---
name: html
description: Hand-authored HTML content-model pitfalls. Use when generating or parsing HTML fragments, injecting markup (innerHTML and friends), or scraping DOM content.
---

Follow [technologies/html.md](../../technologies/html.md) — canonical there: block markup
injected inside a `<p>` silently lands as its next sibling, so read the sibling, not the tag.
