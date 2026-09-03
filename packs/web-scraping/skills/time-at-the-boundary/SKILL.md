---
name: time-at-the-boundary
description: How a scraper converts a source's instants and ambiguous date strings into the domain's local time — once, at the ingestion boundary, with a known-answer probe — and what a conversion change costs. Use when writing or changing timestamp, time-zone or date-format handling in a data pipeline, or taking a "now".
---

# Time at the boundary

- **Converting an instant to the domain's local time** — instants usually arrive in UTC while
  your domain thinks in local wall-clock. Do the conversion in one function at the ingestion
  boundary and have everything downstream speak local time. Slicing digits out of the string
  files everything an hour off during daylight saving, and **the result looks completely
  plausible** — nothing throws, nothing is empty, the data is simply wrong. Because the failure
  is silent, keep a **known-answer probe**: an item whose correct value you know independently
  (something named after its own time, a figure published elsewhere), checked after every fresh
  pull. "Exactly once" cuts both ways — a stage downstream of the boundary that parses,
  re-offsets or re-reads a stored value as UTC is the same bug from the other end.

- **Taking a "now"** — read it in the domain's zone rather than off the device clock. A reviewer
  in the same zone as the developer cannot see the difference, which is how a device clock
  survives review.

- **Parsing a value whose format is ambiguous** — read it by what the page declares, centrally;
  never per-source, never guessed. A numeric slash date whose parts are both ≤ 12 (`05/07/2026`)
  has no intrinsic answer, so resolve it from a *positive* signal the document gives you (an
  explicit region in `<html lang>` or `og:locale`, a non-English language) and keep the default
  when the signal is absent or region-less, rather than inferring one from the host or the
  venue. Put that resolution in one helper the whole pipeline threads, so a new source cannot
  invent its own reading. A trailing `Z` or `+00:00` is *serialization*, not a claim about the
  subject's zone: it neither supplies the zone nor vetoes deriving one from what the page says
  about the place.

- **Changing the conversion** — it is a **full-snapshot change**. Committed derived data is
  generator output, so the fix isn't done until the raw record is re-run through the new
  conversion and every downstream artifact regenerated. Expect the boundary to move records
  between partitions — items at the end of a day land in the next one, and may fall outside the
  range your day-partitioned files cover — and check that rather than reading it as data loss.
