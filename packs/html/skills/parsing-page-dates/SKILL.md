---
name: parsing-page-dates
description: Resolving an ambiguous numeric slash date (both parts ≤ 12) found in a page — infer the document's day/month convention once from a sibling date or the declared locale, never per field. Use when extracting dates from scraped HTML.
---

# Parsing page dates

- **An ambiguous numeric slash date can't be resolved from its digits — infer the document's convention once, don't guess per-field.** When both parts are ≤ 12 (e.g. `05/07/2026`), resolve the order once per document — never per source or per field — in this order. (1) **An unambiguous sibling date fixes the page's convention**: a slash date elsewhere on the same page with a part > 12 (e.g. `24/07/2026`) parses only one way, and a page is almost always internally consistent — read that date's order and apply it to every other slash date on the page. (2) Failing that, **read the declared locale** (`<html lang>`, `og:locale`): default **month-first** (the order `Date` and most JS parsers assume) and flip to day-first only on a *positive* non-US signal — a non-US region in `lang` / `og:locale`, or a non-English language; a bare `en` with unknown region stays month-first. The `.` / `-` separators are day-first regardless. (2)
