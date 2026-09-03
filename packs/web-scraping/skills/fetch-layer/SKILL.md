---
name: fetch-layer
description: How the code that fetches pages and API responses from a site you don't own is written — one module, headers, delays, the retry set and budget, per-item failure, batching, and what to do when a sandbox or a datacenter IP is blocked. Use when writing or changing the code that fetches from the web, or when such a fetch fails from CI or a sandbox.
---

# The fetch layer

## Writing it

- **Writing the fetch itself** — browser-like headers, a randomized delay between requests, and
  exponential backoff on retry. Route **all** outbound page/API fetching through a single
  module, so swapping the vendor, the proxy or the credential is one edit with one place to
  test.

- **Deciding whether to retry a failed request** — retry only what can improve. A gateway or
  proxy failure (408, 429, 500, 502, 503, 504) is worth another attempt; any other 4xx is about
  your request and will answer the same way forever.

- **Porting a fetch to a language-level HTTP client** — carry the retry policy across the
  rewrite. `curl --retry` covers exactly that status set and the port silently drops all of it,
  so the first transient 500 the old command would have ridden out kills the run.

- **Setting the retry budget** — attempts times per-attempt timeout, plus the waits, must fit
  inside whatever hard limit kills the process, and the backoff should be injectable so tests
  exercise the retry path without sleeping through it.

- **Needing many items from a service with no list endpoint** — no bulk endpoint is not the same
  as no bulk request. GraphQL lets one document alias the same field many times, and many REST
  APIs accept a multi-id parameter. The cap is usually undocumented, so **halve a rejected batch
  and retry** — that keeps batch size a throughput knob and never an accuracy one.

## When an item fails

- **One item in a batch failing to fetch** — record and continue. Log the reason per item and
  emit a report; one unfetchable item should not abandon the batch.

- **A fetch that cannot produce a page at all** — a bot wall, a dead URL, an empty render is a
  dead end, not a pipeline failure: mark the item for a human and **exit successfully**. Failing
  the run converges on the same human signal while also implying the pipeline broke, when in
  fact it correctly declined. The rest of the batch should still land.

## When the host is blocked

- **A sandbox refusing the target host** — an agent sandbox is commonly **bot-blocked**, and its
  egress proxy may refuse the host outright. That refusal is policy: **do not route around it**,
  not with a local fetch and not with an ad-hoc workflow spun up to reach the host. Give the
  fetch one sanctioned home — a scheduled job or workflow on a runner, with the credential in
  repository secrets — and let sessions read the committed raw records instead.

- **A fetch that works on your machine and fails from CI** — a 403/400 or a CAPTCHA wall from a
  runner or a sandbox is usually the *datacenter IP* being blocked, not the headers, so tuning
  them is wasted work. **Reaching a commercial rendering proxy** is the standard answer: a
  residential lane clears the IP block, and these services usually execute JavaScript too, so a
  single-page app records real content. Ask it to render, and give it a wait-for-selector when
  the content you want arrives late. A target that stays blocked even through the proxy is
  un-cacheable: say so and stop, rather than hunting for another route.
