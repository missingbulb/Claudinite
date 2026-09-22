## 2026-09-21 · born · the loop that reads back whether a placement held (#2214)
- **Source:** docs/usage-review/DESIGN.md, the owner's design of 2026-09-21.
- **Reason:** the corpus reaching a session is placed on the promotion ladder by judgment at
  authoring time, and nothing read back whether the placement held. Rates against sessions alone
  cannot separate rare-and-healthy from never-and-broken, so the loop needs a declared expectation
  to compare against - which is what makes the review possible at all rather than a dashboard of
  counts nobody can act on.
- **Mechanism:** a deterministic task, `agent_model: none`. The judgment the review could not make
  deterministically - did this session's activity fall under the description - is left to
  whoever reads the finding, with a digest beside the description. An agent phase was rejected: it
  spends a session a day on a question a reader answers in a minute, and the answer only matters
  once the finding has lasted.
- **Rejected:** coded rules, because every threshold would then need reading code to know what it
  asserts, and the rules are the part a person must be able to review in a sitting; judging inside
  the fold, because thresholds would live in the data plane the dashboard and fleet read, and a
  re-examined threshold would rewrite frozen weeks' meaning.
- **Retire when:** two months of the file's history show no rule firing that a person acted on, or
  the triage's merged proposals fall to zero out of several opened.
- **Landed:** #2214

## 2026-09-22 · policy-changed · an adoption date is not read off the clone's depth (#2214)
- **Source:** the owner's note that a skill reached only at adoption is not strange to find
  unloaded, 2026-09-22.
- **Reason:** `packDeclaredAt` searched the settings file's history for the first commit naming a
  pack, and its own comment claimed a shallow clone answered `null`. It did not: the search returns
  the earliest commit the checkout REACHES, which is a real commit, so the adoption window started
  at the clone's horizon. The canon declared these packs long before any practical fetch depth, so
  the window read as closed and open on two checkouts of one repository - the same review over the
  same record finding different things.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the match is trusted only when the commit BEFORE it did not already carry the pack;
  no parent plus a shallow repository is unknowable and answers null. The adoption rules then read
  *not recorded*, which is what the comment always promised.
- **Retire when:** members carry a declaration date of their own and no history walk is needed to
  find one.
- **Landed:** #2214
