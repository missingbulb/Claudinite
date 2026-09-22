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
