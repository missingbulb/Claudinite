## 2026-08-16 · declined · The git-fixture signing rule as a portable writing-tests practice (#857)
- **Source:** this repo's own local pack, where the lesson sat marked "portable candidate"; promoted
  into `writing-tests` earlier in the same pull request and reverted before it merged.
- **Reason:** every caller of the fixture helper is a Claudinite conformance-check test, there are
  none in product code, and a member's app tests have no reason to build a git repo. The helper pins
  the config and a test goes red if that is removed, which is the strongest rung of the ladder
  rather than the weakest, so the rule needed no prose home at all.
- **Actor:** @missingbulb (owner).

## 2026-09-06 · declined · A public-claim-about-a-person rule, and a node --test discovery check, from nine growth-promote PRs (#1671)
- **Source:** the nine growth-promote pull requests this run consolidated.
- **Reason:** the near-duplicate framings were already carried; a bare `node --test` would have
  fired blocking fleet-wide; and the tall-screenshot, shell-poll-tool, build-identity, secret-naming
  and stuck-issue items were too narrow to earn a rule.
- **Actor:** @missingbulb (owner).

## 2026-09-06 · declined · Nine candidates making unreachable claims about external platforms (#1828)
- **Source:** the four growth-promote pull requests re-derived in that run.
- **Reason:** they assert Firebase, Cloudflare and Apple platform behaviour this sandbox cannot
  reach, or harness behaviour that cannot be forced, so they were held back rather than asserted
  unverified.
- **Actor:** @missingbulb (owner).
