# static-website — why its rules exist

Maintenance and review only: the reason behind each rule, written so a later pass can reaffirm or
retire it. No session loads this file and no rule points a reader here.

- **(RULES-1)** The publish set is deliberately **additive**, and the rule exists to make the cost
  of that choice survivable. The rejected alternative — "publish the repo except the tooling" —
  publishes every draft, note and key nobody thought to exclude, and publishes each *new* one
  silently the day it lands. Additive inverts the failure: a forgotten entry is a missing page,
  visible on the site and caught on the PR by `assemble-site`'s two guards (a publish path that
  does not exist fails the run; so does an assembled site with no root `index.html`). Retire the
  rule if the artifact ever stops being built from an explicit list.

- **(RULES-2)** The version is computed, never typed, because a hand-written `ymmdd` or counter
  either collides with a released version or is dated in the future, and the next bump then
  refuses. The rule is load-bearing only while the release flow writes no version of its own —
  it ships what it finds on the default branch — so the number a reviewer sees on a PR is the
  number that ships. `sw/version-bumped` enforces the bump; `sw/version-scheme` enforces the
  shape. Retire if a serving pack ever starts writing versions during the release.

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
