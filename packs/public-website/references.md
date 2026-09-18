# public-website — why its rules exist

Maintenance and review only: the reason behind each rule, written so a later pass can reaffirm or
retire it. No session loads this file and no rule points a reader here.

- **(RULES-3)** There is no server here to vary `Cache-Control` per file, so the freshness policy
  moves into the client. A per-file TTL reprices the same bet on every file and gets it wrong in
  both directions at once: too long and visitors read stale data, too short and they re-download
  what never changed. A content manifest buys longer caching **and** fresher data, which no TTL
  can offer together, and the extra request is usually one the page already makes for a version
  string. Expect a mismatch mid-deploy (the manifest is fetched, a deploy lands, the asset that
  follows disagrees) — refetch once; only a disagreement surviving fresh copies of both is a
  fault. Retire if these sites ever gain a server that can set per-file headers.

- **(RULES-4)** A stale file carries a perfectly valid hash *of itself*, and an internal
  `"version"` field states which generation it is, never whether that generation is current — so
  caching the manifest does not save a round-trip, it moves the staleness up a level and hides it
  better. On length: a correction applied uniformly across a file is routinely byte-length-neutral
  — a timezone fix rewriting every `16:25` to `17:25` moved **0 bytes** of a 3.1 MB catalogue while
  changing the meaning of every record in it. Record the manifest's hash beside the entry as you
  write it, so the check is a string compare rather than megabytes through a digest on the
  critical path of every load.

- **(RULES-5)** Content-addressed keys ("name the row by its date and time, not its position in
  the array") survive rows being *added and removed*, which is what they are usually chosen for,
  and **not** a systematic correction to the key itself — a timezone shift, a rounding change, a
  rename — which moves every key at once and joins the two halves to nothing. The join-rate
  assertion is the other half: a missing key returns "no data for this row", indistinguishable
  from a row that genuinely has none yet, so a check written as "at least one row joined" passed
  at **6%**.

- **(RULES-6)** "The fetch is allowed to fail — it'll just show as unknown, which we already
  handle" is a claim about every consumer downstream, and it is usually wrong. The rule survives
  as long as the codebase has any boolean, comparison or status lookup that cannot distinguish
  absent from false; a wrong answer with no error is worse than an error.

- **(RULES-7)** The stamp is a generated copy of `package.json`'s version, and a copy that drifts
  names a build that was never served while the page looks perfectly normal. The rule and the
  scheme arrived here from cloudflare-site when versioning stopped being a hosting pack's business
  (owner, 2026-09-17: a hosting pack "needs to only care itself with how to serve, wire release,
  maintain a release … not anything else that deals 'being a website' like versions"). Retire the
  rule if the version stops being copied into the pages.

- **(check:public-website/version-stamp-matches-package)** The same drift, held by a check rather
  than remembered: it fires on what a hand-edit, a half-applied release and a page added without
  the stamp all look like. Every tracked page is in scope because the stamp is the page's own
  opt-in and this pack knows no served directory. Retire it if the version stops being copied
  into the pages.
