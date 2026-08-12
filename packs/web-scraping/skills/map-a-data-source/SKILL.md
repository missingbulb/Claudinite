---
name: map-a-data-source
description: Reconnaissance on a website you want data from but don't control — locate the real data surface (hydration blob, client API, or markup) and write the findings down before any parser exists. Use when adding a new source to a scraper, or when an existing source stops parsing and you suspect the site changed shape.
---

# Map a data source before you parse it

This runs **once per source** (and again when a site is redesigned). Its output is
not code — it is a committed reference doc plus one saved raw payload. Everything
after it is ordinary parsing. The standing rules for the pipeline that follows live
in [the `web-scraping` pack's RULES.md](../../RULES.md).

## 1. Fetch one page and look at what came back

Save the raw response of a single representative page to disk and read it. You are
answering one question: **is the data in this document?**

- If the interesting rows are present in the markup, you have a server-rendered page
  — go to step 2.
- If you got a small shell (a few KB of script tags and an empty root), the page is a
  single-page app and the data arrives separately — go to step 3.

## 2. Look for a hydration blob first

A server-rendered app framework almost always embeds the exact object it rendered
from in a script tag with a stable id. Search the saved document for a large inline
JSON payload and find the path to the record you want (it is usually nested a few
levels under a props/data wrapper).

If one exists, **this is the surface**: it is the site's own typed record, one regex
and one JSON parse away, and it does not care about the layout. Save that object,
verbatim, as your first committed fixture.

If there is no blob, the page's self-describing metadata (JSON-LD `<script
type="application/ld+json">`, `og:` meta tags) is the next-best target — it survives
redesigns that break element selectors.

## 3. Find the client API

Identify the request the page makes for its rows. Two ways in, and the second one
matters more than it sounds:

- **Watch the page load** in browser devtools and read the request: URL, method,
  headers, auth, and the response shape.
- **Read the site's own JavaScript bundles.** Fetch the page, extract the script
  `src` paths (mind any asset prefix — the paths in the HTML already carry it),
  download them, and search for the operation names, query documents and field
  selections. For a GraphQL client the embedded query strings unescape into readable
  SDL, giving you the **complete** set of operations and fields the client was built
  against — the authoritative surface, short of introspection.

  This path is worth knowing because it needs **only the public site host**. When the
  API host is blocked from where you are but the site itself loads, reading its
  bundle still tells you exactly what a request would look like. It cannot execute
  anything, so it is not a bypass of the block.

Then note the auth story. A public listing is frequently reachable with anonymous
credentials the client itself ships — the same read access every visitor has. If
reaching the data requires a real account, stop and take that to the owner.

## 4. Probe the shape, not just the happy path

Before declaring the surface mapped, ask these of it explicitly, because each one has
silently corrupted a pipeline that assumed otherwise:

- **Are timestamps UTC or local?** Take one item whose real-world time you can verify
  independently and check.
- **Which field is authoritative for state?** If there is both a status enum and a
  summarizing boolean, find an item where they disagree — there usually is one.
- **What are the enum's legal values?** Take them from the service's own options
  endpoint, not from the sample you happened to pull.
- **Are numbers numbers?** Amounts and counts frequently arrive as strings.
- **Is anything missing from this surface entirely?** A listing endpoint often
  carries flags but no amounts, with the real values behind a separate per-item
  query. Find that out now, not after you've shipped a catalogue of nulls.
- **Is there a bulk form?** If the per-item query has no list variant, check whether
  one *request* can still carry many items (GraphQL aliases, a multi-id parameter).

## 5. Write it down, then stop

Commit a reference doc beside the scripts holding: the endpoint(s) and auth, the
field surface, the enum values, each answer from step 4, and — explicitly — the
questions you could **not** answer and where they'd have to come from. State the
access constraint too: which hosts are reachable from where, and which sanctioned job
is allowed to do the fetching.

The bar: **a later session should be able to write the parser from this doc without
touching the live service.** If it can't, the reconnaissance isn't finished.
