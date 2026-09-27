## 2026-07-17 · born · Growth-promote: MV3 content-script/toolbar gotchas, non-PR CI read, AWS CLI access (#309)
- **Source:** the TLDR project's local docs.
- **Reason:** promoted at the prose rung - knowledge about what a session can reach, with no
  repo-state invariant a conformance check could carry.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule.
- **Landed:** #309 · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** the sweep cut from every rule in the corpus the consequence prose arguing for a rule
  rather than enabling it, leaving each as trigger, instruction, and at most one clause of why. This
  pack went from 984 words to 885.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466) · pack version 1.

## 2026-09-27 · reworded · Claudinite canon: rule revalidation
- **Reason:** re-probed 2026-09-27: the sandbox already exports `AWS_CA_BUNDLE` at
  `/root/.ccr/ca-bundle.crt`, alongside `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE` and
  `NODE_EXTRA_CA_CERTS`, so the rule's remedy was a no-op and sent a TLS failure down a dead path.
  `aws`, `sam` and `boto3` are all still absent, which the rule's other half claims.
- **Actor:** the canon-rule-revalidation task, running as work item #2349.
- **Model:** claude-opus-5
- **Retire when:** the sandbox stops exporting `AWS_CA_BUNDLE`, or ships the AWS CLI.
